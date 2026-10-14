# Rotacion de la credencial de maquina de las tools (el token que usa n8n).
#
# Por que existe: el token de produccion vivia en un solo sitio y, si se expone, cualquiera puede
# llamar a la API en nombre de n8n (enviar mensajes, transferir, cerrar conversaciones). Rotarlo a
# mano obliga a calcular un SHA-256 y a escribirlo en la tabla, que es donde se equivoca la gente.
#
# Lo que hace y lo que NO hace:
#   - Genera el token con el generador criptografico del sistema y calcula su huella.
#   - Guarda SOLO la huella en `tool_tokens`, igual que hace la API: quien lea la tabla no puede usar
#     el token.
#   - Imprime el token UNA vez, para que lo pongas en n8n. No lo escribe en ningun archivo ni en el
#     historial si lo ejecutas con `-Si` desde un script propio.
#   - NO revoca nada por su cuenta: revocar el viejo antes de que n8n tenga el nuevo deja el bot sin
#     voz. La revocacion es un paso aparte, con `-RevocarId`.
#
# Uso:
#   .\tools\rotar-token-tool.ps1 -Listar
#   .\tools\rotar-token-tool.ps1 -Nombre "n8n produccion (rotado)"
#   .\tools\rotar-token-tool.ps1 -RevocarId 3f1c...   # despues de confirmar que n8n funciona
#
# Si Windows lo bloquea por la politica de ejecucion ("no esta firmado digitalmente"), se ejecuta sin
# cambiar nada del sistema:
#   powershell -ExecutionPolicy Bypass -File .\tools\rotar-token-tool.ps1 -Listar
#
# Los comentarios van sin acentos a proposito: Windows PowerShell 5.1 lee los .ps1 sin BOM como ANSI y
# los acentos se corrompen en la salida.

[CmdletBinding(DefaultParameterSetName = 'Crear')]
param(
  # Nombre con el que queda registrada la credencial, para saber cual es cual despues.
  [Parameter(ParameterSetName = 'Crear')]
  [string]$Nombre = 'n8n produccion (rotado)',

  # Alcances del token nuevo. Tienen que ser los mismos que usa la API o algo dejara de funcionar.
  [Parameter(ParameterSetName = 'Crear')]
  [string[]]$Alcances = @('messages', 'media', 'assignments', 'conversations'),

  # Espacio del que se lee la credencial. Por defecto, el de este proyecto.
  [Parameter(ParameterSetName = 'Crear')]
  [string]$TenantId = 'b8b53c64-00c4-4739-a7ac-b8fc84ea0b72',

  # Ver las credenciales que existen, con su ultimo uso. No imprime ningun token.
  [Parameter(ParameterSetName = 'Listar', Mandatory = $true)]
  [switch]$Listar,

  # Revocar una credencial por su identificador. Es el paso final de la rotacion.
  [Parameter(ParameterSetName = 'Revocar', Mandatory = $true)]
  [string]$RevocarId,

  # No preguntar. Para ejecutarlo desde otro script.
  [switch]$Si,

  # Ruta del .env con SUPABASE_URL y la clave de servicio. Vacio = el .env del proyecto.
  # El valor por defecto se calcula en el cuerpo: dentro de `param`, la ruta del script todavia es
  # nula y Windows PowerShell 5.1 falla al resolverla.
  [string]$ArchivoEnv = ''
)

$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 negocia TLS 1.0 por defecto y la API lo rechaza.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not $ArchivoEnv) {
  $raizProyecto = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
  $ArchivoEnv = Join-Path $raizProyecto '.env'
}

function Leer-Env {
  param([string]$Ruta)

  if (-not (Test-Path $Ruta)) {
    throw "No encuentro el archivo de entorno: $Ruta"
  }

  $valores = @{}
  foreach ($linea in Get-Content -Path $Ruta) {
    if ($linea -match '^\s*#' -or $linea -notmatch '=') { continue }
    $partes = $linea.Split('=', 2)
    $clave = $partes[0].Trim()
    $valor = $partes[1].Trim().Trim('"').Trim("'")
    $valores[$clave] = $valor
  }
  return $valores
}

function Cabeceras {
  param([string]$Clave)

  return @{
    apikey        = $Clave
    Authorization = "Bearer $Clave"
  }
}

function CabecerasDeEscritura {
  param([string]$Clave)

  # Sin `Prefer: return=representation`, PostgREST responde 201 con el cuerpo vacio y no se puede
  # confirmar que la fila quedo como se pidio: eso convierte "creado" en una suposicion.
  $cabeceras = Cabeceras -Clave $Clave
  $cabeceras['Prefer'] = 'return=representation'
  return $cabeceras
}

function Nueva-Credencial {
  # 32 bytes del generador del sistema: 256 bits de entropia, no una frase elegida por una persona.
  $bytes = New-Object byte[] 32
  $generador = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generador.GetBytes($bytes)
  } finally {
    $generador.Dispose()
  }

  $token = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $huella = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($token))) -replace '-', '').ToLower()
  } finally {
    $sha.Dispose()
  }

  return @{ huella = $huella; token = $token }
}

$env = Leer-Env -Ruta $ArchivoEnv
$base = $env['SUPABASE_URL']
$clave = if ($env['SUPABASE_SERVICE_ROLE_KEY']) { $env['SUPABASE_SERVICE_ROLE_KEY'] } else { $env['SUPABASE_SECRET_KEY'] }
if (-not $base -or -not $clave) {
  throw 'Faltan SUPABASE_URL o la clave de servicio en el archivo de entorno.'
}
$base = $base.TrimEnd('/')
$cabeceras = Cabeceras -Clave $clave

function Listar-Credenciales {
  param([switch]$Silencioso)

  $filas = Invoke-RestMethod -Headers $cabeceras -Method Get -Uri (
    "$base/rest/v1/tool_tokens?select=id,name,scopes,last_used_at,revoked_at,created_at&order=created_at.asc"
  )
  if (-not $Silencioso) {
    if (-not $filas -or $filas.Count -eq 0) {
      Write-Host 'No hay credenciales registradas.'
      return @()
    }
    foreach ($fila in $filas) {
      $estado = if ($fila.revoked_at) { "revocada el $($fila.revoked_at)" } else { 'activa' }
      $uso = if ($fila.last_used_at) { $fila.last_used_at } else { 'sin uso registrado' }
      Write-Host ''
      Write-Host "  $($fila.name)  [$estado]"
      Write-Host "    id:        $($fila.id)"
      Write-Host "    alcances:  $($fila.scopes -join ', ')"
      Write-Host "    ultimo uso: $uso"
    }
    Write-Host ''
  }
  return $filas
}

if ($Listar) {
  Listar-Credenciales | Out-Null
  return
}

if ($RevocarId) {
  $cuerpo = @{ revoked_at = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json
  $revocada = @(Invoke-RestMethod -Headers (CabecerasDeEscritura -Clave $clave) -Method Patch `
      -ContentType 'application/json' -Body $cuerpo `
      -Uri "$base/rest/v1/tool_tokens?id=eq.$RevocarId&select=id,name,revoked_at")
  if ($revocada.Count -eq 0) {
    Write-Host "No existe ninguna credencial con ese identificador: $RevocarId"
    return
  }
  Write-Host "Credencial revocada: $($revocada[0].name) ($($revocada[0].id))"
  Write-Host 'Comprueba que n8n sigue trabajando con la credencial nueva antes de dar la rotacion por cerrada.'
  return
}

# --- Crear ---------------------------------------------------------------------------------------

$activas = @(Listar-Credenciales -Silencioso | Where-Object { -not $_.revoked_at })
Write-Host ''
Write-Host 'Se va a crear una credencial nueva y NO se revoca ninguna.'
Write-Host "  espacio:   $TenantId"
Write-Host "  nombre:    $Nombre"
Write-Host "  alcances:  $($Alcances -join ', ')"
if ($activas.Count -gt 0) {
  Write-Host "  activas:   $($activas.Count) ($($activas.name -join ', ')) - se revocan despues, a mano"
}
Write-Host ''

if (-not $Si) {
  $respuesta = Read-Host 'Escribir el token nuevo en la base? (s/N)'
  if ($respuesta -notmatch '^[sS]') {
    Write-Host 'No se hizo nada.'
    return
  }
}

$nueva = Nueva-Credencial
$cuerpo = @{
  tenant_id  = $TenantId
  name       = $Nombre
  token_hash = $nueva.huella
  scopes     = $Alcances
} | ConvertTo-Json

$creada = @(Invoke-RestMethod -Headers (CabecerasDeEscritura -Clave $clave) -Method Post `
    -ContentType 'application/json' -Body $cuerpo `
    -Uri "$base/rest/v1/tool_tokens?select=id,name,scopes") | Select-Object -First 1

Write-Host ''
Write-Host 'Credencial creada.'
Write-Host "  id: $($creada.id)"
Write-Host ''

# El token se muestra UNA vez: la base solo guarda su huella, asi que no se puede recuperar despues.
Write-Host 'TOKEN (copialo ahora, no se puede recuperar):' -ForegroundColor Yellow
Write-Host $nueva.token -ForegroundColor Yellow
Write-Host ''

Write-Host 'Pasos para cerrar la rotacion:'
Write-Host '  1. En n8n, cambia WEPLASH_TOOL_TOKEN por ese valor y reinicia n8n.'
Write-Host '  2. Prueba una ejecucion real (por ejemplo, enviar un mensaje desde un flujo).'
foreach ($vieja in $activas) {
  Write-Host "  3. Revoca la anterior:  .\tools\rotar-token-tool.ps1 -RevocarId $($vieja.id)   # $($vieja.name)"
}
Write-Host ''
Write-Host 'Recuerda: revocar antes de que n8n tenga el token nuevo deja el bot sin voz.'
