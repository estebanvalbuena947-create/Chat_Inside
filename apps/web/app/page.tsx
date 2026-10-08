'use client';

import Image from 'next/image';
import { FormEvent, Fragment, useEffect, useRef, useState } from 'react';
import ReservationsPanel from './reservas/page';

type Conversation = {
  assignmentVersion: number;
  assignedUserId: string | null;
  automationMode: 'auto' | 'suggest' | 'paused';
  automationVersion: number;
  channelPlatform: string | null;
  channelAccountId: string | null;
  contactAvatarAvailable: boolean;
  contactId: string;
  contactName: string;
  contactUsername: string | null;
  id: string;
  lastMessageAt: string | null;
  lastMessageDirection: 'inbound' | 'outbound' | null;
  lastMessagePreview: string | null;
  attentionLevel: 'ok' | 'aviso' | 'alto' | null;
  needsAttention: boolean;
  startedAt: string | null;
  status: 'open' | 'pending' | 'resolved';
  statusVersion: number;
  updatedAt: string;
};
type MediaPreview = {
  contactName: string;
  conversationId: string;
  kind: MessageAttachment['kind'];
  title: string | null;
  url: string | null;
};
type MessageAttachment = {
  contentType: string | null;
  id: string;
  kind: 'audio' | 'file' | 'image' | 'share' | 'video';
  title: string | null;
  url: string | null;
};
type Message = {
  attachments: MessageAttachment[];
  body: string;
  commentPrivateReplyAvailable?: boolean;
  commentState?: 'visible' | 'hidden' | 'deleted';
  createdAt: string;
  direction: 'inbound' | 'outbound';
  id: string;
  senderType: 'contact' | 'agent' | 'automation' | 'system';
  source: 'dm' | 'comment';
  sentAt: string | null;
  status: 'received' | 'draft' | 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  // Presente cuando el mensaje salió como plantilla aprobada de Meta.
  whatsappTemplate: { language: string; name: string } | null;
};

/**
 * Una plantilla del catálogo tal como la sirve la API.
 *
 * `sendable` y `blockedReason` vienen decididos: esta pantalla no vuelve a deducir qué se puede
 * enviar, solo lo presenta.
 */
type WhatsappTemplate = {
  blockedReason: string | null;
  category: string | null;
  channelAccountIds: string[];
  language: string | null;
  name: string;
  previewText: string;
  sendable: boolean;
  status: string | null;
  variables: string[];
};
type MediaItem = {
  contactId: string;
  contactName: string;
  contentType: string | null;
  conversationId: string;
  createdAt: string;
  id: string;
  kind: MessageAttachment['kind'];
  messageId: string;
  title: string | null;
  url: string | null;
};
type Tenant = { id: string; name: string; role: 'admin' | 'supervisor' | 'agent'; slug: string };
type CannedResponse = {
  body: string;
  canManage: boolean;
  id: string;
  title: string;
  updatedAt: string;
  version: number;
};
type InternalLabel = {
  color: string;
  id: string;
  name: string;
  updatedAt: string;
  version: number;
};
type TenantMember = {
  displayName: string | null;
  email: string | null;
  role: 'admin' | 'supervisor' | 'agent';
  userId: string;
};
type OwnProfile = {
  displayName: string | null;
  email: string | null;
  userId: string;
};
type ConversationNote = {
  body: string;
  createdAt: string;
  createdByUserId: string;
  id: string;
};
type ConnectedChannel = {
  createdAt: string;
  displayName: string | null;
  id: string;
  platform: string | null;
};
type InboxState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'no_tenant' }
  | { kind: 'tenant_selection_required' }
  | { kind: 'ready'; conversations: Conversation[]; nextCursor: string | null; tenant: Tenant };
type HistoryState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; messages: Message[] };
type ConversationFilter = 'all' | Conversation['status'];
type AssignmentScope = 'all' | 'assigned_to_me';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
function formatConversationTime(value: string | null): string {
  if (!value) return 'Sin mensajes';
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value)
  );
}
function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value)
  );
}
function messageDayKey(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
function messageDayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;
  const dayKey = messageDayKey(value);

  if (dayKey === todayKey) return 'Hoy';
  if (dayKey === yesterdayKey) return 'Ayer';

  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
}
function messageStatusLabel(status: Message['status']): string {
  const labels: Record<Message['status'], string> = {
    delivered: 'entregado',
    draft: 'borrador',
    failed: 'falló',
    queued: 'en cola',
    read: 'leído',
    received: 'recibido',
    sending: 'enviando',
    sent: 'enviado'
  };
  return labels[status];
}
function conversationStatusLabel(status: Conversation['status']): string {
  const labels: Record<Conversation['status'], string> = {
    open: 'Abierta',
    pending: 'Pendiente',
    resolved: 'Resuelta'
  };
  return labels[status];
}
function channelPlatformLabel(platform: Conversation['channelPlatform']): string {
  if (!platform) return 'Canal no identificado';

  const labels: Record<string, string> = {
    facebook: 'Messenger',
    instagram: 'Instagram',
    messenger: 'Messenger',
    tiktok: 'TikTok',
    whatsapp: 'WhatsApp'
  };
  return labels[platform.toLocaleLowerCase('es-CO')] ?? platform;
}
function channelPlatformClass(platform: Conversation['channelPlatform']): string {
  if (!platform) return 'unknown';

  const normalized = platform.toLocaleLowerCase('es-CO');
  if (normalized === 'facebook') return 'messenger';
  return ['instagram', 'messenger', 'tiktok', 'whatsapp'].includes(normalized)
    ? normalized
    : 'unknown';
}
function channelPlatformAbbreviation(platform: Conversation['channelPlatform']): string {
  const normalized = channelPlatformClass(platform);
  const abbreviations: Record<string, string> = {
    instagram: 'IG',
    messenger: 'M',
    tiktok: 'TK',
    whatsapp: 'WA'
  };
  return abbreviations[normalized] ?? '•';
}
function contactUsernameLabel(username: Conversation['contactUsername']): string | null {
  if (!username) return null;
  return username.startsWith('@') ? username : `@${username}`;
}
/**
 * Que significa cada color del punto de la bandeja.
 *
 * No se escriben minutos aqui a proposito: el nivel ya lo decidio la API con la politica del
 * dominio, y esta pantalla solo lo cuenta con palabras. Si los limites cambian, esto sigue valiendo.
 */
function attentionLevelLabel(level: NonNullable<Conversation['attentionLevel']>): string {
  if (level === 'alto') return 'Sin responder: ya es urgente';
  if (level === 'aviso') return 'Sin responder: empieza a demorar';
  return 'Sin responder: dentro de lo normal';
}
function conversationPreviewLabel(conversation: Conversation): string {
  if (conversation.lastMessagePreview) {
    return conversation.lastMessageDirection === 'outbound'
      ? `Equipo: ${conversation.lastMessagePreview}`
      : conversation.lastMessagePreview;
  }

  if (conversation.lastMessageAt) return 'Adjunto no soportado todavía';
  if (conversation.status === 'resolved') return 'Conversación resuelta';
  if (conversation.status === 'pending') return 'En espera de respuesta';
  return 'Sin mensajes todavía';
}
function ArrowDown(): React.ReactNode {
  return <span className="chevron">⌄</span>;
}

/** Iconos de la barra lateral: trazos simples que heredan el color del elemento. */
function SidebarIcon({ paths }: { paths: string[] }) {
  return (
    <svg
      aria-hidden="true"
      className="nav-icon"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width="18"
    >
      {paths.map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}
export default function HomePage(): React.ReactNode {
  const [inbox, setInbox] = useState<InboxState>({ kind: 'loading' });
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'inbox' | 'media' | 'metrics' | 'reservations'>(
    'inbox'
  );
  const [metricsDays, setMetricsDays] = useState<number>(30);
  const [metrics, setMetrics] = useState<MetricsState>({ kind: 'loading' });
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaKind, setMediaKind] = useState<'' | MessageAttachment['kind']>('image');
  const [mediaNextCursor, setMediaNextCursor] = useState<string | null>(null);
  const [isMediaLoading, setIsMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState<MediaPreview | null>(null);
  const [mediaSearchInput, setMediaSearchInput] = useState('');
  const [mediaSearch, setMediaSearch] = useState('');
  const [history, setHistory] = useState<HistoryState>({ kind: 'idle' });
  const [historyReloadVersion, setHistoryReloadVersion] = useState(0);
  const [inboxReloadVersion, setInboxReloadVersion] = useState(0);
  const [draft, setDraft] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [continuationError, setContinuationError] = useState<string | null>(null);
  const [readMarkError, setReadMarkError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ConversationFilter>('all');
  const [assignmentScope, setAssignmentScope] = useState<AssignmentScope>('all');
  // Bandeja de mensajes directos o de comentarios: la bandeja abre en mensajes.
  const [conversationKind, setConversationKind] = useState<'messages' | 'comments'>('messages');
  // Filtro por plataforma: vacio significa todas las cuentas del espacio.
  const [platformFilter, setPlatformFilter] = useState('');
  const [channelPlatforms, setChannelPlatforms] = useState<string[]>([]);
  const [labelFilterId, setLabelFilterId] = useState<string | null>(null);
  const [isLabelFilterOpen, setIsLabelFilterOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isWonDialogOpen, setIsWonDialogOpen] = useState(false);
  const [wonAmount, setWonAmount] = useState('');
  const [wonCurrency, setWonCurrency] = useState('MXN');
  const [isMarkingWon, setIsMarkingWon] = useState(false);
  const [wonError, setWonError] = useState<string | null>(null);
  const [commentActionMessageId, setCommentActionMessageId] = useState<string | null>(null);
  const [commentActionError, setCommentActionError] = useState<string | null>(null);
  const [privateReplyMessageId, setPrivateReplyMessageId] = useState<string | null>(null);
  const [privateReplyDraft, setPrivateReplyDraft] = useState('');
  const [tenantMembers, setTenantMembers] = useState<TenantMember[]>([]);
  const [tenantMembersError, setTenantMembersError] = useState<string | null>(null);
  const [isTenantMembersLoading, setIsTenantMembersLoading] = useState(false);
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
  const [isUpdatingAssignment, setIsUpdatingAssignment] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [isUpdatingAutomation, setIsUpdatingAutomation] = useState(false);
  const [automationError, setAutomationError] = useState<string | null>(null);
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  // Plantillas aprobadas de Meta. Son de la cuenta de WhatsApp, no de la conversacion, y se piden
  // al abrir el panel: no tiene sentido ir al proveedor cada vez que se abre un chat.
  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsappTemplate[]>([]);
  const [whatsappTemplatesError, setWhatsappTemplatesError] = useState<string | null>(null);
  const [isWhatsappTemplatesLoading, setIsWhatsappTemplatesLoading] = useState(false);
  const [isWhatsappTemplatesOpen, setIsWhatsappTemplatesOpen] = useState(false);
  // Plantilla pendiente de confirmar: enviar una plantilla de Meta tiene coste y no se deshace.
  const [pendingWhatsappTemplate, setPendingWhatsappTemplate] = useState<WhatsappTemplate | null>(
    null
  );
  const [cannedResponsesError, setCannedResponsesError] = useState<string | null>(null);
  const [isCannedResponsesLoading, setIsCannedResponsesLoading] = useState(false);
  const [isCannedResponsesOpen, setIsCannedResponsesOpen] = useState(false);
  const [isCannedResponseManagerOpen, setIsCannedResponseManagerOpen] = useState(false);
  const [editingCannedResponse, setEditingCannedResponse] = useState<CannedResponse | null>(null);
  const [cannedResponseTitle, setCannedResponseTitle] = useState('');
  const [cannedResponseBody, setCannedResponseBody] = useState('');
  const [isSavingCannedResponse, setIsSavingCannedResponse] = useState(false);
  const [internalLabels, setInternalLabels] = useState<InternalLabel[]>([]);
  const [conversationLabels, setConversationLabels] = useState<InternalLabel[]>([]);
  const [conversationNotes, setConversationNotes] = useState<ConversationNote[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [notesError, setNotesError] = useState<string | null>(null);
  const [isNotesLoading, setIsNotesLoading] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [internalLabelsError, setInternalLabelsError] = useState<string | null>(null);
  const [isInternalLabelsLoading, setIsInternalLabelsLoading] = useState(false);
  const [conversationLabelsError, setConversationLabelsError] = useState<string | null>(null);
  const [isConversationLabelsLoading, setIsConversationLabelsLoading] = useState(false);
  const [isUpdatingConversationLabels, setIsUpdatingConversationLabels] = useState(false);
  const [isConversationLabelsOpen, setIsConversationLabelsOpen] = useState(false);
  const [isInternalLabelManagerOpen, setIsInternalLabelManagerOpen] = useState(false);
  // Multimedia por sede: se elige la sede, se pega un enlace y se ve lo que ya hay. Se reutilizan
  // las clases del panel de etiquetas, que ya trae su estilo.
  const [isBranchMediaOpen, setIsBranchMediaOpen] = useState(false);
  const [branchMediaBranches, setBranchMediaBranches] = useState<
    Array<{ name: string; slug: string }>
  >([]);
  const [branchMediaSlug, setBranchMediaSlug] = useState('');
  const [branchMediaSourceUrl, setBranchMediaSourceUrl] = useState('');
  const [branchMediaTitle, setBranchMediaTitle] = useState('');
  const [branchMediaItems, setBranchMediaItems] = useState<
    Array<{ id: string; kind: string; title: string | null; url: string | null }>
  >([]);
  const [branchMediaNotice, setBranchMediaNotice] = useState<string | null>(null);
  const [isLoadingBranchMedia, setIsLoadingBranchMedia] = useState(false);
  const [isImportingBranchMedia, setIsImportingBranchMedia] = useState(false);

  async function loadBranchMedia(slug: string): Promise<void> {
    setIsLoadingBranchMedia(true);
    setBranchMediaNotice(null);
    try {
      const respuesta = await fetch(`/api/branches/media?branchSlug=${encodeURIComponent(slug)}`, {
        cache: 'no-store'
      });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as {
        error?: string;
        items?: Array<{ id: string; kind: string; title: string | null; url: string | null }>;
      };
      if (!respuesta.ok) {
        setBranchMediaNotice(cuerpo.error ?? 'No se pudo leer el material de la sede.');
        return;
      }
      setBranchMediaItems(Array.isArray(cuerpo.items) ? cuerpo.items : []);
    } catch {
      setBranchMediaNotice('No se pudo leer el material de la sede.');
    } finally {
      setIsLoadingBranchMedia(false);
    }
  }

  async function openBranchMediaManager(): Promise<void> {
    setIsBranchMediaOpen(true);
    setIsLoadingBranchMedia(true);
    setBranchMediaNotice(null);
    try {
      const respuesta = await fetch('/api/branches', { cache: 'no-store' });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as {
        branches?: Array<{ name: string; slug: string }>;
        error?: string;
      };
      if (!respuesta.ok) {
        setBranchMediaNotice(cuerpo.error ?? 'No se pudieron leer las sedes.');
        return;
      }
      const sedes = Array.isArray(cuerpo.branches) ? cuerpo.branches : [];
      setBranchMediaBranches(sedes);
      const primera = sedes[0]?.slug ?? '';
      setBranchMediaSlug(primera);
      if (primera) await loadBranchMedia(primera);
    } catch {
      setBranchMediaNotice('No se pudieron leer las sedes.');
    } finally {
      setIsLoadingBranchMedia(false);
    }
  }

  async function importBranchMedia(): Promise<void> {
    setIsImportingBranchMedia(true);
    setBranchMediaNotice(null);
    try {
      const respuesta = await fetch('/api/branches/media', {
        body: JSON.stringify({
          branchSlug: branchMediaSlug,
          sourceUrl: branchMediaSourceUrl,
          title: branchMediaTitle.trim() || undefined
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string };
      if (!respuesta.ok) {
        setBranchMediaNotice(cuerpo.error ?? 'No se pudo importar el archivo.');
        return;
      }
      setBranchMediaSourceUrl('');
      setBranchMediaTitle('');
      setBranchMediaNotice('Archivo importado.');
      await loadBranchMedia(branchMediaSlug);
    } catch {
      setBranchMediaNotice('No se pudo importar el archivo.');
    } finally {
      setIsImportingBranchMedia(false);
    }
  }
  const [editingInternalLabel, setEditingInternalLabel] = useState<InternalLabel | null>(null);
  const [internalLabelName, setInternalLabelName] = useState('');
  const [isSavingInternalLabel, setIsSavingInternalLabel] = useState(false);
  const [isChannelSetupOpen, setIsChannelSetupOpen] = useState(false);
  const [connectedChannels, setConnectedChannels] = useState<ConnectedChannel[]>([]);
  const [channelSetupError, setChannelSetupError] = useState<string | null>(null);
  const [isChannelsLoading, setIsChannelsLoading] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [renamingChannelId, setRenamingChannelId] = useState<string | null>(null);
  const [channelNameDraft, setChannelNameDraft] = useState('');
  const [channelRenameError, setChannelRenameError] = useState<string | null>(null);
  const [isRenamingChannel, setIsRenamingChannel] = useState(false);
  const [isTeamOpen, setIsTeamOpen] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TenantMember['role']>('agent');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [ownProfile, setOwnProfile] = useState<OwnProfile | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isMobileListOpen, setIsMobileListOpen] = useState(true);
  const [failedAvatarContactIds, setFailedAvatarContactIds] = useState<Set<string>>(
    () => new Set()
  );
  const loadedHistoryConversationId = useRef<string | null>(null);
  // Filtros aplicados en la ultima respuesta: distingue un refresco automatico de un cambio
  // de filtro, que debe reemplazar la lista en lugar de conservar lo anterior.
  const appliedFilterKeyRef = useRef('');
  const inboxRef = useRef<InboxState>({ kind: 'loading' });
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const isPinnedToBottomRef = useRef(true);
  const scrolledConversationId = useRef<string | null>(null);

  const conversations = inbox.kind === 'ready' ? inbox.conversations : [];
  const normalizedSearch = search.trim();
  const visibleConversations = conversations.filter(
    (conversation) => statusFilter === 'all' || conversation.status === statusFilter
  );
  // El historial llega ordenado del mas antiguo al mas nuevo: el primero es el inicio real
  // de la conversacion, y por eso no hace falta una columna nueva en la base.
  const firstMessageAt =
    history.kind === 'ready' && history.messages.length > 0
      ? (history.messages[0].sentAt ?? history.messages[0].createdAt)
      : null;
  const selectedConversation =
    conversations.find((item) => item.id === selectedConversationId) ?? null;
  const tenant = inbox.kind === 'ready' ? inbox.tenant : null;
  const tenantId = tenant?.id ?? null;
  const selectedLabelFilter = internalLabels.find((label) => label.id === labelFilterId) ?? null;
  const selectedAssignee = selectedConversation?.assignedUserId
    ? (tenantMembers.find((member) => member.userId === selectedConversation.assignedUserId) ??
      null)
    : null;

  function memberLabel(member: TenantMember): string {
    return member.displayName ?? member.email ?? `Miembro ${member.userId.slice(0, 8)}`;
  }

  function noteAuthorLabel(note: ConversationNote): string {
    const author = tenantMembers.find((member) => member.userId === note.createdByUserId);
    return author ? memberLabel(author) : 'Miembro del equipo';
  }

  function hasContactAvatar(conversation: Conversation): boolean {
    return (
      conversation.contactAvatarAvailable && !failedAvatarContactIds.has(conversation.contactId)
    );
  }

  function markAvatarAsFailed(contactId: string): void {
    setFailedAvatarContactIds((current) => {
      if (current.has(contactId)) return current;
      const next = new Set(current);
      next.add(contactId);
      return next;
    });
  }

  function handleMessagesScroll(): void {
    const container = messagesRef.current;
    if (!container) return;
    isPinnedToBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight <= 80;
  }

  async function markConversationRead(conversationId: string, upTo: string): Promise<void> {
    try {
      const response = await fetch(`/api/inbox/${conversationId}/read`, {
        body: JSON.stringify({ upTo }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok) {
        const payload = response.headers.get('content-type')?.includes('application/json')
          ? await response.json()
          : {};
        throw new Error(payload.error ?? 'No fue posible marcar la conversación como leída.');
      }
      setReadMarkError(null);
      setInbox((current) =>
        current.kind === 'ready'
          ? {
              ...current,
              conversations: current.conversations.map((conversation) =>
                conversation.id === conversationId
                  ? { ...conversation, needsAttention: false }
                  : conversation
              )
            }
          : current
      );
    } catch (error) {
      setReadMarkError(
        error instanceof Error ? error.message : 'No fue posible marcar la conversación como leída.'
      );
    }
  }

  async function loadMoreConversations(): Promise<void> {
    if (inbox.kind !== 'ready' || !inbox.nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setContinuationError(null);
    try {
      const queryParams = new URLSearchParams({ cursor: inbox.nextCursor });
      queryParams.set('kind', conversationKind);
      if (platformFilter) queryParams.set('platform', platformFilter);
      if (assignmentScope === 'assigned_to_me') queryParams.set('assignmentScope', assignmentScope);
      if (labelFilterId) queryParams.set('labelId', labelFilterId);
      if (normalizedSearch) queryParams.set('search', normalizedSearch);
      const response = await fetch(`/api/inbox?${queryParams.toString()}`, { cache: 'no-store' });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || payload.state !== 'ready' || !Array.isArray(payload.conversations)) {
        throw new Error(payload.error ?? 'No fue posible continuar la bandeja.');
      }
      const page = payload.conversations as Conversation[];
      setInbox((current) =>
        current.kind === 'ready'
          ? {
              ...current,
              conversations: [
                ...current.conversations,
                ...page.filter(
                  (conversation) =>
                    !current.conversations.some((existing) => existing.id === conversation.id)
                )
              ],
              nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null
            }
          : current
      );
    } catch (error) {
      // Un fallo al continuar no borra lo que la persona ya tiene a la vista.
      setContinuationError(
        error instanceof Error ? error.message : 'No fue posible continuar la bandeja.'
      );
    } finally {
      setIsLoadingMore(false);
    }
  }

  useEffect(() => {
    inboxRef.current = inbox;
  }, [inbox]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // La vuelta de Zernio trae el resultado en la direccion. El registro no se fia de ese dato:
  // lo verifica la API contra Zernio antes de dar de alta la cuenta en el espacio.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const error = params.get('error');
    const accountId = params.get('accountId');
    if (!connected && !error) return;

    window.history.replaceState({}, '', window.location.pathname);

    if (error) {
      setChannelSetupError(connectErrorMessage(error));
      setIsChannelSetupOpen(true);
      return;
    }
    if (!accountId) return;

    void fetch('/api/channels/attach', {
      body: JSON.stringify({ accountId }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setChannelSetupError(payload.error ?? 'No fue posible registrar el canal conectado.');
        }
        setIsChannelSetupOpen(true);
      })
      .catch(() => {
        setChannelSetupError('No fue posible registrar el canal conectado.');
        setIsChannelSetupOpen(true);
      });
  }, []);

  useEffect(() => {
    let active = true;
    async function loadInbox(): Promise<void> {
      try {
        const queryParams = new URLSearchParams();
        if (assignmentScope === 'assigned_to_me') {
          queryParams.set('assignmentScope', assignmentScope);
        }
        if (labelFilterId) queryParams.set('labelId', labelFilterId);
        if (normalizedSearch) queryParams.set('search', normalizedSearch);
        queryParams.set('kind', conversationKind);
        if (platformFilter) queryParams.set('platform', platformFilter);
        const query = queryParams.size > 0 ? `?${queryParams.toString()}` : '';
        const response = await fetch(`/api/inbox${query}`, { cache: 'no-store' });
        const payload = response.headers.get('content-type')?.includes('application/json')
          ? await response.json()
          : {};
        if (!active) return;
        if (response.status === 401) {
          window.location.assign('/login');
          return;
        }
        if (!response.ok) {
          setInbox({
            kind: 'error',
            message: payload.error ?? 'No fue posible cargar la bandeja.'
          });
          return;
        }
        if (payload.state === 'no_tenant') {
          setInbox({ kind: 'no_tenant' });
          return;
        }
        if (payload.state === 'tenant_selection_required') {
          setInbox({ kind: 'tenant_selection_required' });
          return;
        }
        if (payload.state === 'ready' && payload.tenant && Array.isArray(payload.conversations)) {
          const incoming = payload.conversations as Conversation[];
          const previous = inboxRef.current.kind === 'ready' ? inboxRef.current.conversations : [];
          // Un refresco automatico conserva las paginas ya cargadas para no devolver a la
          // persona al principio de la lista. Al cambiar un filtro, en cambio, la lista se
          // reemplaza: si no, seguirian viendose las conversaciones que el filtro excluye.
          const filterKey = `${assignmentScope}|${conversationKind}|${labelFilterId ?? ''}|${platformFilter}|${normalizedSearch}`;
          const isFilterChange = appliedFilterKeyRef.current !== filterKey;
          appliedFilterKeyRef.current = filterKey;
          const incomingIds = new Set(incoming.map((conversation) => conversation.id));
          const retained = isFilterChange
            ? []
            : previous.filter((conversation) => !incomingIds.has(conversation.id));
          const merged = [...incoming, ...retained];
          setInbox({
            kind: 'ready',
            conversations: merged,
            nextCursor:
              retained.length > 0
                ? inboxRef.current.kind === 'ready'
                  ? inboxRef.current.nextCursor
                  : null
                : typeof payload.nextCursor === 'string'
                  ? payload.nextCursor
                  : null,
            tenant: payload.tenant
          });
          setSelectedConversationId((current) =>
            current && merged.some((conversation) => conversation.id === current)
              ? current
              : (merged[0]?.id ?? null)
          );
          return;
        }
        setInbox({ kind: 'error', message: 'La respuesta de la bandeja no es válida.' });
      } catch {
        if (active) setInbox({ kind: 'error', message: 'La bandeja no está disponible.' });
      }
    }
    void loadInbox();
    return () => {
      active = false;
    };
  }, [
    assignmentScope,
    conversationKind,
    platformFilter,
    inboxReloadVersion,
    labelFilterId,
    normalizedSearch
  ]);

  // Plataformas disponibles para filtrar: solo las que tienen alguna cuenta conectada.
  useEffect(() => {
    let active = true;
    void fetch('/api/channels', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.resolve({})))
      .then((payload: unknown) => {
        if (!active) return;
        const items =
          typeof payload === 'object' &&
          payload !== null &&
          Array.isArray((payload as { items?: unknown }).items)
            ? ((payload as { items: { platform?: unknown }[] }).items ?? [])
            : [];
        const plataformas = items
          .map((item) => (typeof item.platform === 'string' ? item.platform : null))
          .filter((value): value is string => Boolean(value));
        setChannelPlatforms([...new Set(plataformas)]);
      })
      .catch(() => setChannelPlatforms([]));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isChannelSetupOpen) return;
    let active = true;
    setIsChannelsLoading(true);
    setChannelSetupError(null);
    void fetch('/api/channels', { cache: 'no-store' })
      .then(async (response) => {
        const payload = response.headers.get('content-type')?.includes('application/json')
          ? await response.json()
          : {};
        if (response.status === 401) {
          window.location.assign('/login');
          return;
        }
        if (!response.ok || !Array.isArray(payload.items)) {
          throw new Error(payload.error ?? 'No fue posible cargar los canales.');
        }
        if (active) setConnectedChannels(payload.items);
      })
      .catch((error) => {
        if (active) {
          setChannelSetupError(
            error instanceof Error ? error.message : 'No fue posible cargar los canales.'
          );
        }
      })
      .finally(() => {
        if (active) setIsChannelsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isChannelSetupOpen]);

  useEffect(() => {
    if (!isTeamOpen) return;
    setTeamError(null);
    setInviteLink(null);
    void refreshTenantMembers();
  }, [isTeamOpen]);

  useEffect(() => {
    // La barra arranca expandida y recuerda lo que eligio la persona.
    const stored = window.localStorage.getItem('sidebar-expanded');
    if (stored !== null) setIsSidebarExpanded(stored === 'true');
  }, []);

  useEffect(() => {
    window.localStorage.setItem('sidebar-expanded', String(isSidebarExpanded));
  }, [isSidebarExpanded]);

  useEffect(() => {
    // El perfil propio es presentación: si falla, la bandeja sigue operando y el modal lo informa.
    void refreshOwnProfile();
  }, []);

  useEffect(() => {
    if (activeView !== 'media') return;
    void loadMedia(true);
  }, [activeView, mediaKind, mediaSearch]);

  useEffect(() => {
    if (activeView !== 'metrics') return;
    setMetrics({ kind: 'loading' });
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/metrics?days=' + String(metricsDays), {
          cache: 'no-store',
          signal: controller.signal
        });
        const payload = (await response.json()) as MetricsPayload;
        if (!response.ok || typeof payload.totalMessages !== 'number') {
          setMetrics({
            kind: 'error',
            message: payload.error ?? 'No fue posible leer la actividad.'
          });
          return;
        }
        setMetrics({ kind: 'ready', data: payload });
      } catch (error) {
        if (controller.signal.aborted) return;
        setMetrics({
          kind: 'error',
          message: error instanceof Error ? error.message : 'La actividad no esta disponible.'
        });
      }
    })();
    return () => controller.abort();
  }, [activeView, metricsDays]);

  useEffect(() => {
    const handle = window.setTimeout(() => setMediaSearch(mediaSearchInput.trim()), 350);
    return () => window.clearTimeout(handle);
  }, [mediaSearchInput]);

  useEffect(() => {
    if (!tenantId) {
      setCannedResponses([]);
      return;
    }
    let active = true;
    setIsCannedResponsesLoading(true);
    void (async () => {
      try {
        const response = await fetch('/api/canned-responses', { cache: 'no-store' });
        const payload = response.headers.get('content-type')?.includes('application/json')
          ? await response.json()
          : {};
        if (!active) return;
        if (response.status === 401) {
          window.location.assign('/login');
          return;
        }
        if (!response.ok || !Array.isArray(payload.items)) {
          setCannedResponsesError(payload.error ?? 'No fue posible cargar las respuestas rápidas.');
          return;
        }
        setCannedResponses(payload.items);
        setCannedResponsesError(null);
      } catch {
        if (active) setCannedResponsesError('Las respuestas rápidas no están disponibles.');
      } finally {
        if (active) setIsCannedResponsesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) {
      setTenantMembers([]);
      return;
    }
    let active = true;
    setIsTenantMembersLoading(true);
    void (async () => {
      try {
        const response = await fetch('/api/members', { cache: 'no-store' });
        const payload = response.headers.get('content-type')?.includes('application/json')
          ? await response.json()
          : {};
        if (!active) return;
        if (response.status === 401) {
          window.location.assign('/login');
          return;
        }
        if (!response.ok || !Array.isArray(payload.items)) {
          setTenantMembersError(payload.error ?? 'No fue posible cargar los integrantes.');
          return;
        }
        setTenantMembers(payload.items);
        setTenantMembersError(null);
      } catch {
        if (active) setTenantMembersError('Los integrantes no están disponibles.');
      } finally {
        if (active) setIsTenantMembersLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) {
      setInternalLabels([]);
      return;
    }
    let active = true;
    setIsInternalLabelsLoading(true);
    void (async () => {
      try {
        const response = await fetch('/api/labels', { cache: 'no-store' });
        const payload = response.headers.get('content-type')?.includes('application/json')
          ? await response.json()
          : {};
        if (!active) return;
        if (response.status === 401) {
          window.location.assign('/login');
          return;
        }
        if (!response.ok || !Array.isArray(payload.items)) {
          setInternalLabelsError(payload.error ?? 'No fue posible cargar las etiquetas.');
          return;
        }
        setInternalLabels(payload.items);
        setLabelFilterId((current) =>
          current && !payload.items.some((label: InternalLabel) => label.id === current)
            ? null
            : current
        );
        setInternalLabelsError(null);
      } catch {
        if (active) setInternalLabelsError('Las etiquetas no están disponibles.');
      } finally {
        if (active) setIsInternalLabelsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [tenantId]);

  useEffect(() => {
    setSendError(null);
    if (!selectedConversationId) {
      loadedHistoryConversationId.current = null;
      setHistory({ kind: 'idle' });
      return;
    }
    let active = true;
    const isRefreshOfOpenConversation =
      loadedHistoryConversationId.current === selectedConversationId;
    loadedHistoryConversationId.current = selectedConversationId;
    if (!isRefreshOfOpenConversation) {
      setHistory({ kind: 'loading' });
    }
    void (async () => {
      try {
        const response = await fetch(`/api/inbox/${selectedConversationId}/messages`, {
          cache: 'no-store'
        });
        const payload = response.headers.get('content-type')?.includes('application/json')
          ? await response.json()
          : {};
        if (!active) return;
        if (response.status === 401) {
          window.location.assign('/login');
          return;
        }
        if (!response.ok || !Array.isArray(payload.items)) {
          setHistory({
            kind: 'error',
            message: payload.error ?? 'No fue posible cargar el historial.'
          });
          return;
        }
        const messages = payload.items as Message[];
        setHistory({ kind: 'ready', messages });

        // La marca avanza solo hasta el mensaje que la persona ya tiene a la vista.
        const newest = messages.at(-1);
        const selected =
          inboxRef.current.kind === 'ready'
            ? inboxRef.current.conversations.find(
                (conversation) => conversation.id === selectedConversationId
              )
            : undefined;
        if (newest && selected?.needsAttention) {
          void markConversationRead(selectedConversationId, newest.sentAt ?? newest.createdAt);
        }
      } catch {
        if (active) setHistory({ kind: 'error', message: 'El historial no está disponible.' });
      }
    })();
    return () => {
      active = false;
    };
  }, [historyReloadVersion, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) {
      setConversationLabels([]);
      setIsConversationLabelsOpen(false);
      return;
    }
    let active = true;
    setIsConversationLabelsLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/inbox/${selectedConversationId}/labels`, {
          cache: 'no-store'
        });
        const payload = response.headers.get('content-type')?.includes('application/json')
          ? await response.json()
          : {};
        if (!active) return;
        if (response.status === 401) {
          window.location.assign('/login');
          return;
        }
        if (!response.ok || !Array.isArray(payload.items)) {
          setConversationLabelsError(
            payload.error ?? 'No fue posible cargar las etiquetas aplicadas.'
          );
          return;
        }
        setConversationLabels(payload.items);
        setConversationLabelsError(null);
      } catch {
        if (active) setConversationLabelsError('Las etiquetas aplicadas no están disponibles.');
      } finally {
        if (active) setIsConversationLabelsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) {
      setConversationNotes([]);
      setNoteDraft('');
      setNotesError(null);
      return;
    }
    let active = true;
    setIsNotesLoading(true);
    setNotesError(null);
    void (async () => {
      try {
        const response = await fetch(`/api/inbox/${selectedConversationId}/notes`, {
          cache: 'no-store'
        });
        const payload = response.headers.get('content-type')?.includes('application/json')
          ? await response.json()
          : {};
        if (!active) return;
        if (response.status === 401) {
          window.location.assign('/login');
          return;
        }
        if (!response.ok || !Array.isArray(payload.items)) {
          setNotesError(payload.error ?? 'No fue posible cargar las notas privadas.');
          return;
        }
        setConversationNotes(payload.items);
      } catch {
        if (active) setNotesError('Las notas privadas no estan disponibles.');
      } finally {
        if (active) setIsNotesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedConversationId]);

  // Al cambiar de conversación se cierra el panel y se descarta la confirmación a medias: una
  // plantilla confirmada para un contacto no puede acabar enviándose a otro.
  useEffect(() => {
    setIsWhatsappTemplatesOpen(false);
    setPendingWhatsappTemplate(null);
  }, [selectedConversationId]);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container || history.kind !== 'ready') return;

    const isAnotherConversation = scrolledConversationId.current !== selectedConversationId;
    scrolledConversationId.current = selectedConversationId;
    if (!isAnotherConversation && !isPinnedToBottomRef.current) return;

    isPinnedToBottomRef.current = true;
    container.scrollTop = container.scrollHeight;
  }, [history, selectedConversationId]);

  useEffect(() => {
    const hasOpenOverlay =
      isAssignmentOpen ||
      isCannedResponseManagerOpen ||
      isCannedResponsesOpen ||
      isChannelSetupOpen ||
      isConversationLabelsOpen ||
      isDetailsOpen ||
      isInternalLabelManagerOpen ||
      isBranchMediaOpen ||
      isLabelFilterOpen;
    if (!hasOpenOverlay) return;

    function closeTopOverlay(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      if (isBranchMediaOpen) {
        setIsBranchMediaOpen(false);
        return;
      }
      if (isChannelSetupOpen) {
        setIsChannelSetupOpen(false);
        return;
      }
      if (isCannedResponseManagerOpen) {
        setIsCannedResponseManagerOpen(false);
        resetCannedResponseEditor();
        return;
      }
      if (isCannedResponsesOpen) {
        setIsCannedResponsesOpen(false);
        return;
      }
      if (isInternalLabelManagerOpen) {
        setIsInternalLabelManagerOpen(false);
        resetInternalLabelEditor();
        return;
      }
      if (isConversationLabelsOpen) {
        setIsConversationLabelsOpen(false);
        return;
      }
      if (isAssignmentOpen) {
        setIsAssignmentOpen(false);
        return;
      }
      if (isLabelFilterOpen) {
        setIsLabelFilterOpen(false);
        return;
      }
      setIsDetailsOpen(false);
    }

    window.addEventListener('keydown', closeTopOverlay);
    return () => window.removeEventListener('keydown', closeTopOverlay);
  }, [
    isAssignmentOpen,
    isBranchMediaOpen,
    isCannedResponseManagerOpen,
    isCannedResponsesOpen,
    isChannelSetupOpen,
    isConversationLabelsOpen,
    isDetailsOpen,
    isInternalLabelManagerOpen,
    isLabelFilterOpen
  ]);

  useEffect(() => {
    if (!tenantId) return;

    const degradedPollIntervalMs = 4_000;
    const safetyPollIntervalMs = 30_000;
    const source = new EventSource('/api/events');
    let isActive = true;
    let degradedPollTimer: number | null = null;

    const refresh = () => {
      setInboxReloadVersion((current) => current + 1);
      setHistoryReloadVersion((current) => current + 1);
    };
    const stopDegradedPoll = () => {
      if (degradedPollTimer === null) return;
      window.clearInterval(degradedPollTimer);
      degradedPollTimer = null;
    };
    const startDegradedPoll = () => {
      if (!isActive || degradedPollTimer !== null) return;
      degradedPollTimer = window.setInterval(refresh, degradedPollIntervalMs);
    };

    // Mientras el stream no esté abierto, el sondeo rápido sostiene la bandeja. Con el
    // stream abierto solo queda la comprobación lenta, que cubre una señal perdida.
    startDegradedPoll();
    const safetyPollTimer = window.setInterval(refresh, safetyPollIntervalMs);
    source.addEventListener('open', stopDegradedPoll);
    source.addEventListener('error', startDegradedPoll);
    source.addEventListener('inbox.changed', refresh);
    source.addEventListener('inbox.resync', refresh);

    return () => {
      isActive = false;
      stopDegradedPoll();
      window.clearInterval(safetyPollTimer);
      source.close();
    };
  }, [tenantId]);

  async function sendMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const body = draft.trim();
    if (!selectedConversationId || !body || isSending) return;
    setIsSending(true);
    setSendError(null);
    try {
      const response = await fetch(`/api/inbox/${selectedConversationId}/messages`, {
        body: JSON.stringify({ body, idempotencyKey: crypto.randomUUID() }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !payload.item)
        throw new Error(payload.error ?? 'No fue posible preparar el envío.');
      isPinnedToBottomRef.current = true;
      setHistory((current) =>
        current.kind === 'ready'
          ? { kind: 'ready', messages: [...current.messages, payload.item] }
          : current
      );
      setDraft('');
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'No fue posible preparar el envío.');
    } finally {
      setIsSending(false);
    }
  }

  /**
   * Las plantillas del catálogo que pertenecen a la cuenta de esta conversación.
   *
   * Una plantilla de otra cuenta del espacio se vería, pero el proveedor no podría resolverla: solo
   * se ofrece lo que se puede enviar desde este número.
   */
  function whatsappTemplatesForSelection(): WhatsappTemplate[] {
    const accountId = selectedConversation?.channelAccountId;
    if (!accountId) return [];
    return whatsappTemplates.filter((plantilla) => plantilla.channelAccountIds.includes(accountId));
  }

  /**
   * Envía una plantilla aprobada.
   *
   * Va por el mismo extremo que un texto y hereda sus garantías: clave de idempotencia y encolado.
   * Lo que viaja es la referencia (nombre e idioma), nunca el texto: la API comprueba que esa
   * plantilla pertenece al catálogo de la cuenta de esta conversación antes de encolar nada.
   */
  async function sendWhatsappTemplate(template: WhatsappTemplate): Promise<void> {
    if (!selectedConversationId || !template.language || isSending) return;
    setIsSending(true);
    setSendError(null);
    try {
      const response = await fetch(`/api/inbox/${selectedConversationId}/messages`, {
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          kind: 'whatsapp_template',
          whatsappTemplate: { language: template.language, name: template.name }
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !payload.item) {
        throw new Error(payload.error ?? 'No fue posible enviar la plantilla.');
      }
      isPinnedToBottomRef.current = true;
      setHistory((current) =>
        current.kind === 'ready'
          ? { kind: 'ready', messages: [...current.messages, payload.item] }
          : current
      );
      setPendingWhatsappTemplate(null);
      setIsWhatsappTemplatesOpen(false);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'No fue posible enviar la plantilla.');
    } finally {
      setIsSending(false);
    }
  }

  async function saveConversationNote(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const body = noteDraft.trim();
    if (!selectedConversationId || !body || isSavingNote) return;
    setIsSavingNote(true);
    setNotesError(null);
    try {
      const response = await fetch(`/api/inbox/${selectedConversationId}/notes`, {
        body: JSON.stringify({ body, idempotencyKey: crypto.randomUUID() }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !payload.item) {
        throw new Error(payload.error ?? 'No fue posible guardar la nota privada.');
      }
      setConversationNotes((current) =>
        current.some((note) => note.id === payload.item.id) ? current : [...current, payload.item]
      );
      setNoteDraft('');
    } catch (error) {
      setNotesError(
        error instanceof Error ? error.message : 'No fue posible guardar la nota privada.'
      );
    } finally {
      setIsSavingNote(false);
    }
  }

  async function changeConversationStatus(status: Conversation['status']): Promise<void> {
    if (!selectedConversation || isUpdatingStatus || selectedConversation.status === status) return;
    setIsUpdatingStatus(true);
    setStatusError(null);
    try {
      const response = await fetch(`/api/inbox/${selectedConversation.id}/status`, {
        body: JSON.stringify({ status, statusVersion: selectedConversation.statusVersion }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH'
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !payload.item) {
        if (response.status === 409) setInboxReloadVersion((current) => current + 1);
        throw new Error(payload.error ?? 'No fue posible cambiar el estado.');
      }
      setInbox((current) =>
        current.kind === 'ready'
          ? {
              ...current,
              conversations: current.conversations.map((conversation) =>
                conversation.id === payload.item.id ? payload.item : conversation
              )
            }
          : current
      );
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'No fue posible cambiar el estado.');
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  async function markConversationWon(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedConversation || isMarkingWon) return;
    setIsMarkingWon(true);
    setWonError(null);
    try {
      const response = await fetch(`/api/inbox/${selectedConversation.id}/won`, {
        body: JSON.stringify({ amount: Number(wonAmount), currency: wonCurrency.trim() }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? 'No fue posible marcarla como ganada.');
      setIsWonDialogOpen(false);
      setWonAmount('');
      setWonCurrency('MXN');
      setInboxReloadVersion((current) => current + 1);
    } catch (error) {
      setWonError(error instanceof Error ? error.message : 'No fue posible marcarla como ganada.');
    } finally {
      setIsMarkingWon(false);
    }
  }

  async function actOnComment(
    message: Message,
    action: 'delete' | 'hide' | 'private-reply' | 'unhide'
  ): Promise<void> {
    if (!selectedConversation || commentActionMessageId) return;
    setCommentActionMessageId(message.id);
    setCommentActionError(null);
    try {
      const path = `/api/inbox/${selectedConversation.id}/messages/${message.id}/comment`;
      const response = await fetch(
        action === 'delete'
          ? path
          : action === 'hide' || action === 'unhide'
            ? `${path}/hide`
            : `${path}/private-reply`,
        action === 'delete'
          ? { method: 'DELETE' }
          : {
              body:
                action === 'private-reply'
                  ? JSON.stringify({ message: privateReplyDraft.trim() })
                  : undefined,
              headers:
                action === 'private-reply' ? { 'Content-Type': 'application/json' } : undefined,
              method: action === 'unhide' ? 'DELETE' : 'POST'
            }
      );
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok)
        throw new Error(payload.error ?? 'No fue posible actualizar el comentario.');
      setPrivateReplyMessageId(null);
      setPrivateReplyDraft('');
      setHistoryReloadVersion((current) => current + 1);
    } catch (error) {
      setCommentActionError(
        error instanceof Error ? error.message : 'No fue posible actualizar el comentario.'
      );
    } finally {
      setCommentActionMessageId(null);
    }
  }

  async function changeConversationAssignment(assignedUserId: string | null): Promise<void> {
    if (!selectedConversation || isUpdatingAssignment) return;
    if (selectedConversation.assignedUserId === assignedUserId) {
      setIsAssignmentOpen(false);
      return;
    }
    setIsUpdatingAssignment(true);
    setAssignmentError(null);
    try {
      const response = await fetch(`/api/inbox/${selectedConversation.id}/assignment`, {
        body: JSON.stringify({
          assignedUserId,
          assignmentVersion: selectedConversation.assignmentVersion
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH'
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !payload.item) {
        if (response.status === 409) setInboxReloadVersion((current) => current + 1);
        throw new Error(payload.error ?? 'No fue posible cambiar la asignación.');
      }
      setInbox((current) =>
        current.kind === 'ready'
          ? {
              ...current,
              conversations: current.conversations.map((conversation) =>
                conversation.id === payload.item.id ? payload.item : conversation
              )
            }
          : current
      );
      setIsAssignmentOpen(false);
    } catch (error) {
      setAssignmentError(
        error instanceof Error ? error.message : 'No fue posible cambiar la asignación.'
      );
    } finally {
      setIsUpdatingAssignment(false);
    }
  }

  async function changeConversationAutomation(automationMode: 'auto' | 'paused'): Promise<void> {
    if (
      !selectedConversation ||
      isUpdatingAutomation ||
      selectedConversation.automationMode === automationMode
    ) {
      return;
    }
    setIsUpdatingAutomation(true);
    setAutomationError(null);
    try {
      const response = await fetch(`/api/inbox/${selectedConversation.id}/automation`, {
        body: JSON.stringify({
          automationMode,
          automationVersion: selectedConversation.automationVersion
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH'
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !payload.item) {
        if (response.status === 409) setInboxReloadVersion((current) => current + 1);
        throw new Error(payload.error ?? 'No fue posible actualizar el bot.');
      }
      setInbox((current) =>
        current.kind === 'ready'
          ? {
              ...current,
              conversations: current.conversations.map((conversation) =>
                conversation.id === payload.item.id ? payload.item : conversation
              )
            }
          : current
      );
    } catch (error) {
      setAutomationError(
        error instanceof Error ? error.message : 'No fue posible actualizar el bot.'
      );
    } finally {
      setIsUpdatingAutomation(false);
    }
  }

  function resetCannedResponseEditor(): void {
    setCannedResponseTitle('');
    setCannedResponseBody('');
    setEditingCannedResponse(null);
  }

  function startEditingCannedResponse(response: CannedResponse): void {
    setCannedResponseTitle(response.title);
    setCannedResponseBody(response.body);
    setEditingCannedResponse(response);
    setIsCannedResponseManagerOpen(true);
    setIsCannedResponsesOpen(false);
    setCannedResponsesError(null);
  }

  function resetInternalLabelEditor(): void {
    setInternalLabelName('');
    setEditingInternalLabel(null);
  }

  function startEditingInternalLabel(label: InternalLabel): void {
    setInternalLabelName(label.name);
    setEditingInternalLabel(label);
    setIsInternalLabelManagerOpen(true);
    setInternalLabelsError(null);
  }

  async function saveInternalLabel(): Promise<void> {
    const name = internalLabelName.trim();
    if (!name || isSavingInternalLabel) return;
    setIsSavingInternalLabel(true);
    setInternalLabelsError(null);
    try {
      const editing = editingInternalLabel;
      const response = await fetch(editing ? `/api/labels/${editing.id}` : '/api/labels', {
        body: JSON.stringify(
          editing
            ? { name, version: editing.version }
            : { idempotencyKey: crypto.randomUUID(), name }
        ),
        headers: { 'Content-Type': 'application/json' },
        method: editing ? 'PATCH' : 'POST'
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !payload.item) {
        throw new Error(payload.error ?? 'No fue posible guardar la etiqueta.');
      }
      setInternalLabels((current) =>
        editing
          ? current.map((item) => (item.id === payload.item.id ? payload.item : item))
          : [payload.item, ...current]
      );
      resetInternalLabelEditor();
    } catch (error) {
      setInternalLabelsError(
        error instanceof Error ? error.message : 'No fue posible guardar la etiqueta.'
      );
    } finally {
      setIsSavingInternalLabel(false);
    }
  }

  async function deleteInternalLabel(label: InternalLabel): Promise<void> {
    if (!window.confirm(`¿Eliminar la etiqueta “$${label.name}”?`)) return;
    setIsSavingInternalLabel(true);
    setInternalLabelsError(null);
    try {
      const response = await fetch(`/api/labels/${label.id}`, {
        body: JSON.stringify({ version: label.version }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE'
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !payload.item) {
        throw new Error(payload.error ?? 'No fue posible eliminar la etiqueta.');
      }
      setInternalLabels((current) => current.filter((item) => item.id !== label.id));
      setConversationLabels((current) => current.filter((item) => item.id !== label.id));
      if (editingInternalLabel?.id === label.id) resetInternalLabelEditor();
    } catch (error) {
      setInternalLabelsError(
        error instanceof Error ? error.message : 'No fue posible eliminar la etiqueta.'
      );
    } finally {
      setIsSavingInternalLabel(false);
    }
  }

  async function toggleConversationLabel(label: InternalLabel): Promise<void> {
    if (!selectedConversation || isUpdatingConversationLabels) return;
    setIsUpdatingConversationLabels(true);
    setConversationLabelsError(null);
    const isApplied = conversationLabels.some((item) => item.id === label.id);
    try {
      const response = await fetch(`/api/inbox/${selectedConversation.id}/labels/${label.id}`, {
        method: isApplied ? 'DELETE' : 'PUT'
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !Array.isArray(payload.items)) {
        throw new Error(payload.error ?? 'No fue posible actualizar las etiquetas.');
      }
      setConversationLabels(payload.items);
    } catch (error) {
      setConversationLabelsError(
        error instanceof Error ? error.message : 'No fue posible actualizar las etiquetas.'
      );
    } finally {
      setIsUpdatingConversationLabels(false);
    }
  }

  /**
   * Plantillas aprobadas de WhatsApp de la cuenta del espacio.
   *
   * Se piden al abrir el panel y no al cargar la bandeja: son un catalogo de la cuenta, no de la
   * conversacion, y no cambian de un chat a otro.
   */
  async function loadWhatsappTemplates(): Promise<void> {
    setIsWhatsappTemplatesLoading(true);
    setWhatsappTemplatesError(null);
    try {
      const response = await fetch('/api/whatsapp/templates', { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        items?: typeof whatsappTemplates;
      };
      if (!response.ok) {
        setWhatsappTemplatesError(payload.error ?? 'No fue posible cargar las plantillas.');
        return;
      }
      setWhatsappTemplates(payload.items ?? []);
    } catch {
      setWhatsappTemplatesError('Las plantillas no están disponibles.');
    } finally {
      setIsWhatsappTemplatesLoading(false);
    }
  }

  function toggleWhatsappTemplates(): void {
    const abriendo = !isWhatsappTemplatesOpen;
    setIsCannedResponsesOpen(false);
    setIsWhatsappTemplatesOpen(abriendo);
    if (abriendo) void loadWhatsappTemplates();
  }

  async function saveCannedResponse(): Promise<void> {
    const title = cannedResponseTitle.trim();
    const body = cannedResponseBody.trim();
    if (!title || !body || isSavingCannedResponse) return;
    setIsSavingCannedResponse(true);
    setCannedResponsesError(null);
    try {
      const editing = editingCannedResponse;
      const response = await fetch(
        editing ? `/api/canned-responses/${editing.id}` : '/api/canned-responses',
        {
          body: JSON.stringify(
            editing
              ? { body, title, version: editing.version }
              : { body, idempotencyKey: crypto.randomUUID(), title }
          ),
          headers: { 'Content-Type': 'application/json' },
          method: editing ? 'PATCH' : 'POST'
        }
      );
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !payload.item) {
        throw new Error(payload.error ?? 'No fue posible guardar la respuesta rápida.');
      }
      setCannedResponses((current) =>
        editing
          ? current.map((item) => (item.id === payload.item.id ? payload.item : item))
          : [payload.item, ...current]
      );
      resetCannedResponseEditor();
    } catch (error) {
      setCannedResponsesError(
        error instanceof Error ? error.message : 'No fue posible guardar la respuesta rápida.'
      );
    } finally {
      setIsSavingCannedResponse(false);
    }
  }

  async function deleteCannedResponse(response: CannedResponse): Promise<void> {
    if (!window.confirm(`¿Eliminar la respuesta rápida “${response.title}”?`)) return;
    setIsSavingCannedResponse(true);
    setCannedResponsesError(null);
    try {
      const request = await fetch(`/api/canned-responses/${response.id}`, {
        body: JSON.stringify({ version: response.version }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE'
      });
      const payload = request.headers.get('content-type')?.includes('application/json')
        ? await request.json()
        : {};
      if (request.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!request.ok || !payload.item) {
        throw new Error(payload.error ?? 'No fue posible eliminar la respuesta rápida.');
      }
      setCannedResponses((current) => current.filter((item) => item.id !== response.id));
      if (editingCannedResponse?.id === response.id) resetCannedResponseEditor();
    } catch (error) {
      setCannedResponsesError(
        error instanceof Error ? error.message : 'No fue posible eliminar la respuesta rápida.'
      );
    } finally {
      setIsSavingCannedResponse(false);
    }
  }

  function formatMediaDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function attachmentLabel(kind: MessageAttachment['kind']): string {
    if (kind === 'image') return 'Imagen';
    if (kind === 'video') return 'Vídeo';
    if (kind === 'audio') return 'Audio';
    if (kind === 'share') return 'Publicación compartida';
    return 'Archivo';
  }

  /** Fecha y hora juntas: con solo la hora no se distingue un mensaje de ayer. */
  function formatConversationStamp(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return `${messageDayLabel(value)} · ${formatMessageTime(value)}`;
  }
  /**
   * Motivos con los que Zernio devuelve al usuario tras una autorizacion, dichos en claro.
   * La lista no es exhaustiva: lo desconocido se muestra con su codigo en lugar de ocultarse.
   */
  function connectErrorMessage(code: string): string {
    const mensajes: Record<string, string> = {
      code_already_redeemed:
        'La autorización ya se había procesado: la cuenta debería aparecer en la lista.',
      instagram_login_method_mismatch:
        'Esa cuenta de Instagram está conectada por Facebook: vuelve a intentarlo con el mismo método.',
      missing_google_permissions:
        'Faltó aceptar algún permiso de Google: vuelve a intentarlo y déjalos todos marcados.',
      missing_tiktok_permissions:
        'Faltó aceptar algún permiso de TikTok: vuelve a intentarlo y acepta todos los permisos.',
      oauth_denied: 'Cancelaste la autorización antes de terminarla.',
      payment_required:
        'Zernio pide un medio de pago para conectar esta cuenta: añádelo en su panel de facturación.',
      profile_not_found: 'El perfil de Zernio de este espacio no existe.'
    };

    return mensajes[code] ?? `No fue posible completar la conexión (${code}).`;
  }
  function shortAttachmentLabel(kind: MessageAttachment['kind']): string {
    if (kind === 'image') return 'Imagen';
    if (kind === 'video') return 'Video';
    if (kind === 'audio') return 'Audio';
    if (kind === 'share') return 'Post';
    return 'Archivo';
  }

  function mediaPreviewFromMessage(attachment: MessageAttachment): MediaPreview {
    return {
      contactName: selectedConversation?.contactName ?? 'Contacto',
      conversationId: selectedConversation?.id ?? '',
      kind: attachment.kind,
      title: attachment.title,
      url: attachment.url
    };
  }

  /**
   * Cierra toda capa superpuesta antes de abrir otra. Sin esto, una vista abierta detras de un
   * modal sigue oculta y la interfaz parece bloqueada: el clic no cambia nada visible.
   */
  function closeOverlays(): void {
    setActiveView('inbox');
    setIsSettingsOpen(false);
    setIsTeamOpen(false);
    setIsChannelSetupOpen(false);
    setIsProfileOpen(false);
    setIsInternalLabelManagerOpen(false);
    setIsCannedResponseManagerOpen(false);
    setMediaPreview(null);
  }
  async function loadMedia(reset: boolean): Promise<void> {
    if (isMediaLoading) return;
    setIsMediaLoading(true);
    if (reset) setMediaError(null);
    try {
      const params = new URLSearchParams();
      if (mediaKind) params.set('kind', mediaKind);
      if (mediaSearch) params.set('search', mediaSearch);
      if (!reset && mediaNextCursor) params.set('cursor', mediaNextCursor);

      const response = await fetch(`/api/media?${params.toString()}`, { cache: 'no-store' });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !Array.isArray(payload.items)) {
        throw new Error(payload.error ?? 'No fue posible cargar la multimedia.');
      }
      setMediaItems((current) => (reset ? payload.items : [...current, ...payload.items]));
      setMediaNextCursor(typeof payload.nextCursor === 'string' ? payload.nextCursor : null);
    } catch (error) {
      setMediaError(
        error instanceof Error ? error.message : 'No fue posible cargar la multimedia.'
      );
    } finally {
      setIsMediaLoading(false);
    }
  }

  async function refreshOwnProfile(): Promise<void> {
    try {
      const response = await fetch('/api/me', { cache: 'no-store' });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !payload.item) {
        throw new Error(payload.error ?? 'No fue posible cargar tu perfil.');
      }
      setOwnProfile(payload.item);
      setProfileNameDraft(payload.item.displayName ?? '');
      setProfileError(null);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'No fue posible cargar tu perfil.');
    }
  }

  async function saveOwnProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const displayName = profileNameDraft.trim();
    if (!displayName || isSavingProfile) return;

    setIsSavingProfile(true);
    setProfileError(null);
    try {
      const response = await fetch('/api/me', {
        body: JSON.stringify({ displayName }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH'
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !payload.item) {
        throw new Error(payload.error ?? 'No fue posible guardar tu perfil.');
      }
      setOwnProfile(payload.item);
      setIsProfileOpen(false);
      // El nombre aparece de inmediato en las notas y en las asignaciones del equipo.
      await refreshTenantMembers();
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'No fue posible guardar tu perfil.');
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function refreshTenantMembers(): Promise<void> {
    try {
      const response = await fetch('/api/members', { cache: 'no-store' });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !Array.isArray(payload.items)) {
        throw new Error(payload.error ?? 'No fue posible cargar los integrantes.');
      }
      setTenantMembers(payload.items);
      setTenantMembersError(null);
    } catch (error) {
      setTeamError(
        error instanceof Error ? error.message : 'No fue posible cargar los integrantes.'
      );
    }
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!email || isInviting) return;

    setIsInviting(true);
    setTeamError(null);
    setInviteLink(null);
    try {
      const response = await fetch('/api/members/invitations', {
        body: JSON.stringify({ email, role: inviteRole }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || typeof payload.item?.inviteLink !== 'string') {
        throw new Error(payload.error ?? 'No fue posible generar la invitación.');
      }
      // El enlace es de un solo uso y solo se muestra aquí: no se registra ni se reenvía.
      setInviteLink(payload.item.inviteLink);
      setInviteEmail('');
      await refreshTenantMembers();
    } catch (error) {
      setTeamError(
        error instanceof Error ? error.message : 'No fue posible generar la invitación.'
      );
    } finally {
      setIsInviting(false);
    }
  }

  async function changeMemberRole(member: TenantMember, role: TenantMember['role']): Promise<void> {
    if (member.role === role || updatingMemberId) return;

    setUpdatingMemberId(member.userId);
    setTeamError(null);
    try {
      const response = await fetch(`/api/members/${member.userId}`, {
        body: JSON.stringify({ role }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH'
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !payload.item) {
        throw new Error(payload.error ?? 'No fue posible cambiar el rol.');
      }
      setTenantMembers((current) =>
        current.map((item) => (item.userId === payload.item.userId ? payload.item : item))
      );
    } catch (error) {
      // El selector vuelve solo a la representación vigente porque el estado no cambió.
      setTeamError(error instanceof Error ? error.message : 'No fue posible cambiar el rol.');
    } finally {
      setUpdatingMemberId(null);
    }
  }

  async function removeMember(member: TenantMember): Promise<void> {
    if (updatingMemberId) return;
    if (!window.confirm(`¿Retirar el acceso de ${memberLabel(member)}?`)) return;

    setUpdatingMemberId(member.userId);
    setTeamError(null);
    try {
      const response = await fetch(`/api/members/${member.userId}`, { method: 'DELETE' });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !payload.item) {
        throw new Error(payload.error ?? 'No fue posible retirar el acceso.');
      }
      setTenantMembers((current) => current.filter((item) => item.userId !== member.userId));
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : 'No fue posible retirar el acceso.');
    } finally {
      setUpdatingMemberId(null);
    }
  }

  async function renameChannel(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const displayName = channelNameDraft.trim();
    if (!renamingChannelId || !displayName || isRenamingChannel) return;

    setIsRenamingChannel(true);
    setChannelRenameError(null);
    try {
      const response = await fetch(`/api/channels/${renamingChannelId}`, {
        body: JSON.stringify({ displayName }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH'
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || !payload.item) {
        throw new Error(payload.error ?? 'No fue posible nombrar el canal.');
      }
      setConnectedChannels((current) =>
        current.map((channel) => (channel.id === payload.item.id ? payload.item : channel))
      );
      setRenamingChannelId(null);
      setChannelNameDraft('');
    } catch (error) {
      setChannelRenameError(
        error instanceof Error ? error.message : 'No fue posible nombrar el canal.'
      );
    } finally {
      setIsRenamingChannel(false);
    }
  }

  async function startChannelConnection(
    platform: 'facebook' | 'instagram' | 'tiktok' | 'whatsapp'
  ): Promise<void> {
    if (connectingPlatform) return;
    setConnectingPlatform(platform);
    setChannelSetupError(null);
    try {
      const response = await fetch('/api/channels/connect', {
        body: JSON.stringify({ platform }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : {};
      if (response.status === 401) {
        window.location.assign('/login');
        return;
      }
      if (!response.ok || typeof payload.authorizationUrl !== 'string') {
        throw new Error(payload.error ?? 'No fue posible abrir la conexión de Zernio.');
      }
      window.location.assign(payload.authorizationUrl);
    } catch (error) {
      setChannelSetupError(
        error instanceof Error ? error.message : 'No fue posible abrir la conexión de Zernio.'
      );
    } finally {
      setConnectingPlatform(null);
    }
  }

  return (
    <main
      className={`workspace ${isMobileListOpen ? 'mobile-list-open' : ''} ${isSidebarExpanded ? 'sidebar-open' : ''}`}
    >
      <aside className="primary-nav" aria-label="Navegación principal">
        <div className="brand-row">
          <div className="brand-mark">
            <Image
              alt="Inside Spa"
              className="inside-spa-logo compact"
              height={100}
              priority
              src="/logo-inside-spa.png"
              width={100}
            />
          </div>
          <div className="brand-filter">
            <span>Plataformas</span>
            <select
              aria-label="Filtrar por plataforma"
              className="status-select brand-platform"
              id="conversation-platform-filter"
              onChange={(event) => setPlatformFilter(event.target.value)}
              value={platformFilter}
            >
              <option value="">Todas</option>
              {channelPlatforms.map((platform) => (
                <option key={platform} value={platform}>
                  {platform.charAt(0).toUpperCase() + platform.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <nav>
          <button
            aria-label={isSidebarExpanded ? 'Contraer la barra' : 'Expandir la barra'}
            aria-pressed={isSidebarExpanded}
            className="nav-item sidebar-toggle"
            onClick={() => setIsSidebarExpanded((current) => !current)}
            title={isSidebarExpanded ? 'Contraer la barra' : 'Expandir la barra'}
            type="button"
          >
            <SidebarIcon paths={[isSidebarExpanded ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6']} />
            <span className="nav-label">Contraer</span>
          </button>{' '}
          <button
            aria-current={activeView === 'metrics' ? 'page' : undefined}
            className={'nav-item ' + (activeView === 'metrics' ? 'active' : '')}
            onClick={() => setActiveView('metrics')}
            type="button"
          >
            <span className="nav-icon" aria-hidden="true">
              <svg
                fill="none"
                height="18"
                stroke="currentColor"
                strokeWidth="1.7"
                viewBox="0 0 24 24"
                width="18"
              >
                <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
              </svg>
            </span>
            <span className="nav-label">Dashboard</span>
          </button>
          {tenant?.role !== 'agent' && (
            <button
              aria-current={activeView === 'reservations' ? 'page' : undefined}
              className={'nav-item ' + (activeView === 'reservations' ? 'active' : '')}
              onClick={() => {
                closeOverlays();
                setActiveView('reservations');
              }}
              type="button"
            >
              <SidebarIcon paths={['M4 5h16v15H4z', 'M8 3v4M16 3v4M4 10h16', 'M8 14h3M8 17h6']} />
              <span className="nav-label">Reservas</span>
            </button>
          )}
          <button
            aria-current={activeView === 'inbox' ? 'page' : undefined}
            aria-label="Bandeja"
            className={`nav-item ${activeView === 'inbox' ? 'active' : ''}`}
            onClick={() => {
              closeOverlays();
            }}
            title="Bandeja"
            type="button"
          >
            <SidebarIcon
              paths={[
                'M3 12h5l1.5 2.5h5L16 12h5',
                'M5 5h14l2 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2-7Z'
              ]}
            />
            <span className="nav-label">Bandeja</span>
          </button>
          <button
            aria-label="Comprobantes de pago"
            className={`nav-item ${activeView === 'media' ? 'active' : ''}`}
            onClick={() => {
              closeOverlays();
              setActiveView('media');
            }}
            title="Comprobantes"
            type="button"
          >
            <SidebarIcon
              paths={[
                'M4 5h16v14H4z',
                'M8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
                'M4 16l5-4 4 3 3-2 4 3'
              ]}
            />
            <span className="nav-label">Comprobantes</span>
          </button>
          {tenant?.role === 'admin' && (
            <button
              aria-label="Equipo"
              className="nav-item"
              onClick={() => {
                closeOverlays();
                setIsTeamOpen(true);
              }}
              title="Equipo"
              type="button"
            >
              <SidebarIcon
                paths={[
                  'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20',
                  'M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
                  'M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4',
                  'M15.5 5a3.5 3.5 0 0 1 0 6.8'
                ]}
              />
              <span className="nav-label">Equipo</span>
            </button>
          )}{' '}
          <button
            aria-label="Configuracion"
            className={`nav-item ${isSettingsOpen ? 'active' : ''}`}
            onClick={() => {
              closeOverlays();
              setIsSettingsOpen(true);
            }}
            title="Configuracion"
            type="button"
          >
            <SidebarIcon
              paths={[
                'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z',
                'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'
              ]}
            />
            <span className="nav-label">Configuracion</span>
          </button>
          {tenant?.role === 'admin' && (
            <button
              aria-label="Configurar canales"
              className="nav-item"
              onClick={() => {
                closeOverlays();
                setIsChannelSetupOpen(true);
              }}
              title="Canales"
              type="button"
            >
              <SidebarIcon
                paths={['M9 3v5', 'M15 3v5', 'M7 8h10v3a5 5 0 0 1-10 0V8Z', 'M12 16v5']}
              />
              <span className="nav-label">Canales</span>
            </button>
          )}
        </nav>
        <div className="nav-bottom">
          <button
            aria-label="Mi perfil"
            className="nav-user"
            onClick={() => {
              closeOverlays();
              setIsProfileOpen(true);
              setProfileError(null);
              void refreshOwnProfile();
            }}
            title="Mi perfil"
            type="button"
          >
            <span className="user-avatar">
              {initials(ownProfile?.displayName ?? ownProfile?.email ?? 'Yo')}
            </span>
            <span className="nav-label">{ownProfile?.displayName ?? 'Mi perfil'}</span>
          </button>

          <form action="/auth/signout" method="post">
            <button
              aria-label="Cerrar sesión"
              className="nav-item nav-item-stacked"
              title="Cerrar sesión"
              type="submit"
            >
              <SidebarIcon
                paths={['M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'M10 8l-4 4 4 4', 'M6 12h9']}
              />
              <span className="nav-label">logout</span>
            </button>
          </form>
        </div>
      </aside>
      <section className="inbox-column" id="inbox" aria-label="Bandeja de entrada">
        <header className="inbox-header">
          <div>
            <p className="eyebrow">
              {tenant ? `${tenant.name.toUpperCase()} · CHAT` : 'INSIDE SPA · CHAT'}
            </p>
            <h1>
              Bandeja de entrada <ArrowDown />
            </h1>
          </div>
        </header>
        <label className="search-box" htmlFor="conversation-search">
          <span>⌕</span>
          <input
            id="conversation-search"
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por nombre o usuario"
            type="search"
            value={searchInput}
          />
        </label>
        <div className="label-filter-control">
          <button
            aria-expanded={isLabelFilterOpen}
            className={`label-filter-trigger ${labelFilterId ? 'active' : ''}`}
            onClick={() => setIsLabelFilterOpen((current) => !current)}
            type="button"
          >
            {selectedLabelFilter ? `Etiqueta: ${selectedLabelFilter.name}` : 'Filtrar por etiqueta'}
          </button>
          {labelFilterId && (
            <button
              aria-label="Quitar filtro de etiqueta"
              className="label-filter-clear"
              onClick={() => setLabelFilterId(null)}
              type="button"
            >
              ×
            </button>
          )}
          {isLabelFilterOpen && (
            <div className="label-filter-menu" aria-label="Elegir etiqueta para filtrar">
              <button
                aria-pressed={!labelFilterId}
                className={!labelFilterId ? 'selected' : ''}
                onClick={() => {
                  setLabelFilterId(null);
                  setIsLabelFilterOpen(false);
                }}
                type="button"
              >
                Todas las etiquetas
              </button>
              {isInternalLabelsLoading && <p>Cargando etiquetas…</p>}
              {!isInternalLabelsLoading && internalLabels.length === 0 && (
                <p>Aún no hay etiquetas creadas.</p>
              )}
              {internalLabels.map((label) => (
                <button
                  aria-pressed={label.id === labelFilterId}
                  className={label.id === labelFilterId ? 'selected' : ''}
                  key={label.id}
                  onClick={() => {
                    setLabelFilterId(label.id);
                    setIsLabelFilterOpen(false);
                  }}
                  type="button"
                >
                  <span className="label-name-chip" style={{ backgroundColor: label.color }}>
                    {label.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="inbox-tabs kind-tabs" aria-label="Tipo de bandeja">
          {(
            [
              ['messages', 'Mensajes'],
              ['comments', 'Comentarios']
            ] as const
          ).map(([kind, label]) => (
            <button
              aria-pressed={conversationKind === kind}
              className={`tab ${conversationKind === kind ? 'selected' : ''}`}
              key={kind}
              onClick={() => setConversationKind(kind)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="inbox-tabs status-tabs" aria-label="Estado de las conversaciones">
          <label className="status-select-label" htmlFor="conversation-status-filter">
            Estado
          </label>
          <select
            className="status-select"
            id="conversation-status-filter"
            onChange={(event) => setStatusFilter(event.target.value as ConversationFilter)}
            value={statusFilter}
          >
            <option value="all">Todas</option>
            <option value="open">Abiertas</option>
            <option value="pending">Pendientes</option>
            <option value="resolved">Resueltas</option>
          </select>
          <button
            aria-pressed={assignmentScope === 'assigned_to_me'}
            className={`tab ${assignmentScope === 'assigned_to_me' ? 'selected' : ''}`}
            onClick={() =>
              setAssignmentScope(assignmentScope === 'assigned_to_me' ? 'all' : 'assigned_to_me')
            }
            type="button"
          >
            Asignadas a mi
          </button>
        </div>
        <div className="conversation-list">
          {inbox.kind === 'loading' && <p className="inbox-state">Cargando conversaciones…</p>}
          {inbox.kind === 'error' && <p className="inbox-state error">{inbox.message}</p>}
          {inbox.kind === 'no_tenant' && (
            <p className="inbox-state">Tu usuario aún no tiene acceso a un tenant.</p>
          )}
          {inbox.kind === 'tenant_selection_required' && (
            <p className="inbox-state">Selecciona un tenant para continuar.</p>
          )}
          {inbox.kind === 'ready' && conversations.length === 0 && (
            <p className="inbox-state">
              {normalizedSearch
                ? 'No encontramos conversaciones con esa búsqueda.'
                : 'Aún no hay conversaciones en esta bandeja.'}
            </p>
          )}
          {inbox.kind === 'ready' &&
            conversations.length > 0 &&
            visibleConversations.length === 0 && (
              <p className="inbox-state">No encontramos conversaciones con esa búsqueda.</p>
            )}
          {visibleConversations.map((conversation) => (
            <button
              className={`conversation-card ${conversation.id === selectedConversationId ? 'selected' : ''}`}
              key={conversation.id}
              onClick={() => {
                setSelectedConversationId(conversation.id);
                setIsMobileListOpen(false);
              }}
              type="button"
            >
              <div className="contact-avatar-wrap">
                <div className="avatar lavender">{initials(conversation.contactName)}</div>
                {hasContactAvatar(conversation) && (
                  <img
                    alt=""
                    className="contact-avatar-image"
                    onError={() => markAvatarAsFailed(conversation.contactId)}
                    src={`/api/contacts/${conversation.contactId}/avatar`}
                  />
                )}
                <span
                  aria-label={channelPlatformLabel(conversation.channelPlatform)}
                  className={`contact-platform-mark platform-${channelPlatformClass(
                    conversation.channelPlatform
                  )}`}
                >
                  {channelPlatformAbbreviation(conversation.channelPlatform)}
                </span>
              </div>
              <div
                className={'conversation-summary' + (conversation.needsAttention ? ' unread' : '')}
              >
                <div className="conversation-title">
                  <strong>{conversation.contactName}</strong>
                  <span className="contact-origin">
                    {contactUsernameLabel(conversation.contactUsername) ??
                      channelPlatformLabel(conversation.channelPlatform)}
                  </span>
                  <time>{formatConversationTime(conversation.lastMessageAt)}</time>
                </div>
                <p className="conversation-preview">{conversationPreviewLabel(conversation)}</p>
              </div>
              {conversation.attentionLevel && (
                <span
                  aria-label={attentionLevelLabel(conversation.attentionLevel)}
                  className={'attention-dot ' + conversation.attentionLevel}
                  title={attentionLevelLabel(conversation.attentionLevel)}
                />
              )}
            </button>
          ))}
          {continuationError && (
            <p className="inbox-state error" role="alert">
              {continuationError}
            </p>
          )}
          {inbox.kind === 'ready' && inbox.nextCursor && (
            <button
              className="load-more-conversations"
              disabled={isLoadingMore}
              onClick={() => void loadMoreConversations()}
              type="button"
            >
              {isLoadingMore ? 'Cargando…' : 'Cargar más conversaciones'}
            </button>
          )}
        </div>
      </section>
      <section className="conversation-panel" aria-label="Conversación">
        {selectedConversation ? (
          <>
            <header className="conversation-header">
              <div className="header-contact">
                <button
                  aria-label="Volver a la lista de conversaciones"
                  className="mobile-back"
                  onClick={() => setIsMobileListOpen(true)}
                  type="button"
                >
                  ←
                </button>
                <div className="header-contact-content">
                  <h2>{selectedConversation.contactName}</h2>
                  <p
                    className={`conversation-platform platform-${channelPlatformClass(
                      selectedConversation.channelPlatform
                    )}`}
                  >
                    {channelPlatformLabel(selectedConversation.channelPlatform)}
                  </p>
                </div>
              </div>
              <div className="conversation-header-actions">
                <button
                  aria-expanded={isDetailsOpen}
                  className="details-toggle"
                  onClick={() => setIsDetailsOpen((current) => !current)}
                  type="button"
                >
                  Detalles
                </button>
              </div>
            </header>
            {isAssignmentOpen && (tenant?.role === 'admin' || tenant?.role === 'supervisor') && (
              <section className="assignment-picker" aria-label="Asignar conversación">
                <button
                  aria-pressed={!selectedConversation.assignedUserId}
                  className={!selectedConversation.assignedUserId ? 'selected' : ''}
                  disabled={isUpdatingAssignment}
                  onClick={() => void changeConversationAssignment(null)}
                  type="button"
                >
                  Sin asignar
                </button>
                {isTenantMembersLoading && <p>Cargando integrantes…</p>}
                {!isTenantMembersLoading && tenantMembers.length === 0 && (
                  <p>No hay integrantes disponibles para asignar.</p>
                )}
                {tenantMembers.map((member) => (
                  <button
                    aria-pressed={member.userId === selectedConversation.assignedUserId}
                    className={
                      member.userId === selectedConversation.assignedUserId ? 'selected' : ''
                    }
                    disabled={isUpdatingAssignment}
                    key={member.userId}
                    onClick={() => void changeConversationAssignment(member.userId)}
                    type="button"
                  >
                    {memberLabel(member)} <span>{member.role}</span>
                  </button>
                ))}
              </section>
            )}
            {(assignmentError || tenantMembersError || automationError) && (
              <p className="assignment-error" role="alert">
                {assignmentError ?? tenantMembersError ?? automationError}
              </p>
            )}
            {isConversationLabelsOpen && (
              <section className="conversation-label-picker" aria-label="Aplicar etiquetas">
                {isInternalLabelsLoading && <p>Cargando etiquetas…</p>}
                {!isInternalLabelsLoading && internalLabels.length === 0 && (
                  <p>Aún no hay etiquetas creadas para este tenant.</p>
                )}
                {internalLabels.map((label) => {
                  const isApplied = conversationLabels.some((item) => item.id === label.id);
                  return (
                    <button
                      aria-pressed={isApplied}
                      className={`conversation-label-option ${isApplied ? 'applied' : ''}`}
                      disabled={isUpdatingConversationLabels}
                      key={label.id}
                      onClick={() => void toggleConversationLabel(label)}
                      type="button"
                    >
                      {isApplied ? '✓ ' : ''}
                      <span className="label-name-chip" style={{ backgroundColor: label.color }}>
                        {label.name}
                      </span>
                    </button>
                  );
                })}
              </section>
            )}
            {internalLabelsError && (
              <p className="internal-label-error" role="alert">
                {internalLabelsError}
              </p>
            )}
            {statusError && (
              <p className="status-error" role="alert">
                {statusError}
              </p>
            )}
            <div
              className="messages"
              aria-live="polite"
              onScroll={handleMessagesScroll}
              ref={messagesRef}
            >
              {history.kind === 'loading' && <p className="inbox-state">Cargando historial…</p>}
              {history.kind === 'error' && <p className="inbox-state error">{history.message}</p>}
              {history.kind === 'ready' && history.messages.length === 0 && (
                <p className="inbox-state">Aún no hay mensajes guardados en esta conversación.</p>
              )}
              {history.kind === 'ready' &&
                history.messages.map((message, index) => {
                  const previous = index > 0 ? history.messages[index - 1] : null;
                  const messageTimestamp = message.sentAt ?? message.createdAt;
                  const startsNewDay =
                    !previous ||
                    messageDayKey(previous.sentAt ?? previous.createdAt) !==
                      messageDayKey(messageTimestamp);

                  return (
                    <Fragment key={message.id}>
                      {startsNewDay && (
                        <p className="message-date">{messageDayLabel(messageTimestamp)}</p>
                      )}
                      <div
                        className={`message-row ${message.direction === 'outbound' ? 'outgoing' : ''}`}
                      >
                        <div className="bubble">
                          {message.source === 'comment' && (
                            <div
                              className="conversation-actions"
                              aria-label="Acciones de comentario"
                            >
                              <button
                                className="status-action"
                                disabled={commentActionMessageId === message.id}
                                onClick={() =>
                                  void actOnComment(
                                    message,
                                    message.commentState === 'hidden' ? 'unhide' : 'hide'
                                  )
                                }
                                type="button"
                              >
                                {message.commentState === 'hidden' ? 'Mostrar' : 'Ocultar'}
                              </button>
                              <button
                                className="status-action"
                                disabled={commentActionMessageId === message.id}
                                onClick={() => void actOnComment(message, 'delete')}
                                type="button"
                              >
                                Eliminar
                              </button>
                              {message.commentPrivateReplyAvailable !== false && (
                                <button
                                  className="status-action"
                                  disabled={commentActionMessageId === message.id}
                                  onClick={() => {
                                    setPrivateReplyMessageId(message.id);
                                    setPrivateReplyDraft('');
                                    setCommentActionError(null);
                                  }}
                                  type="button"
                                >
                                  Responder privado
                                </button>
                              )}
                              {privateReplyMessageId === message.id && (
                                <form
                                  className="private-note-form"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    void actOnComment(message, 'private-reply');
                                  }}
                                >
                                  <textarea
                                    aria-label="Respuesta privada"
                                    disabled={commentActionMessageId === message.id}
                                    maxLength={2200}
                                    onChange={(event) => setPrivateReplyDraft(event.target.value)}
                                    placeholder="Escribe una respuesta privada…"
                                    rows={3}
                                    value={privateReplyDraft}
                                  />
                                  <button
                                    disabled={
                                      !privateReplyDraft.trim() ||
                                      commentActionMessageId === message.id
                                    }
                                    type="submit"
                                  >
                                    Enviar privado
                                  </button>
                                </form>
                              )}
                            </div>
                          )}
                          {message.attachments.map((attachment) =>
                            attachment.kind === 'share' ? (
                              <article className="bubble-attachment" key={attachment.id}>
                                {attachment.url && attachment.contentType?.startsWith('video/') ? (
                                  <video
                                    className="bubble-video"
                                    controls
                                    playsInline
                                    preload="metadata"
                                    src={attachment.url}
                                  />
                                ) : attachment.url ? (
                                  <img alt="Publicación compartida" src={attachment.url} />
                                ) : null}
                                <strong>Publicación compartida</strong>
                                {attachment.title && <p>{attachment.title}</p>}
                              </article>
                            ) : attachment.url && attachment.kind === 'audio' ? (
                              <audio
                                className="bubble-audio"
                                controls
                                key={attachment.id}
                                preload="metadata"
                                src={attachment.url}
                              />
                            ) : attachment.url && attachment.kind === 'video' ? (
                              <video
                                className="bubble-video"
                                controls
                                key={attachment.id}
                                playsInline
                                preload="metadata"
                                src={attachment.url}
                              />
                            ) : attachment.url && attachment.kind === 'image' ? (
                              <button
                                className="bubble-media"
                                key={attachment.id}
                                onClick={() => setMediaPreview(mediaPreviewFromMessage(attachment))}
                                type="button"
                              >
                                <img alt="Imagen enviada por el contacto" src={attachment.url} />
                              </button>
                            ) : attachment.url ? (
                              <button
                                className="bubble-attachment"
                                key={attachment.id}
                                onClick={() => setMediaPreview(mediaPreviewFromMessage(attachment))}
                                type="button"
                              >
                                {attachmentLabel(attachment.kind)} · Ver
                              </button>
                            ) : (
                              <span className="bubble-attachment" key={attachment.id}>
                                {attachmentLabel(attachment.kind)} · sin copia disponible
                              </span>
                            )
                          )}
                          {message.attachments.some(
                            (attachment) => attachment.title && attachment.kind !== 'share'
                          ) && (
                            <p className="bubble-caption">
                              {
                                message.attachments.find(
                                  (attachment) => attachment.title && attachment.kind !== 'share'
                                )?.title
                              }
                            </p>
                          )}
                          {message.body.trim() ? (
                            message.body
                          ) : message.attachments.length === 0 ? (
                            <em className="message-without-text">Adjunto no soportado todavía</em>
                          ) : null}
                          {message.source === 'comment' && (
                            <span className="bubble-author bubble-author-comment">Comentario</span>
                          )}
                          {message.senderType === 'automation' && (
                            <span className="bubble-author">Bot</span>
                          )}
                          {message.whatsappTemplate && (
                            <span className="bubble-author">
                              Plantilla · {message.whatsappTemplate.name}
                            </span>
                          )}

                          <time>
                            {formatMessageTime(messageTimestamp)}
                            {message.direction === 'outbound'
                              ? ` · ${messageStatusLabel(message.status)}`
                              : ''}
                          </time>
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
            </div>
            <form className="composer" onSubmit={sendMessage}>
              <div className="composer-topline">
                <button
                  aria-expanded={isCannedResponsesOpen}
                  className="canned-response-trigger"
                  onClick={() => setIsCannedResponsesOpen((current) => !current)}
                  type="button"
                >
                  Respuestas rápidas
                </button>
                {selectedConversation?.channelPlatform === 'whatsapp' && (
                  <button
                    aria-expanded={isWhatsappTemplatesOpen}
                    className="canned-response-trigger"
                    onClick={toggleWhatsappTemplates}
                    type="button"
                  >
                    Plantillas de WhatsApp
                  </button>
                )}
              </div>
              {isCannedResponsesOpen && (
                <div
                  className="canned-response-picker"
                  role="dialog"
                  aria-label="Respuestas rápidas"
                >
                  {isCannedResponsesLoading && <p>Cargando respuestas…</p>}
                  {!isCannedResponsesLoading && cannedResponses.length === 0 && (
                    <p>Aún no hay respuestas rápidas guardadas.</p>
                  )}
                  {cannedResponses.map((response) => (
                    <button
                      className="canned-response-option"
                      key={response.id}
                      onClick={() => {
                        setDraft(response.body);
                        setIsCannedResponsesOpen(false);
                      }}
                      type="button"
                    >
                      <strong>{response.title}</strong>
                      <span>{response.body}</span>
                    </button>
                  ))}
                </div>
              )}
              {cannedResponsesError && (
                <p className="canned-response-error" role="alert">
                  {cannedResponsesError}
                </p>
              )}
              {isWhatsappTemplatesOpen && (
                <div
                  aria-label="Plantillas de WhatsApp"
                  className="canned-response-picker"
                  role="dialog"
                >
                  {isWhatsappTemplatesLoading && <p>Cargando plantillas…</p>}
                  {!isWhatsappTemplatesLoading && whatsappTemplatesForSelection().length === 0 && (
                    <p>Esta conversación no tiene plantillas aprobadas en su cuenta de WhatsApp.</p>
                  )}
                  {whatsappTemplatesForSelection().map((plantilla) => (
                    <button
                      className="canned-response-option"
                      disabled={!plantilla.sendable || isSending}
                      key={plantilla.name + '|' + (plantilla.language ?? '')}
                      onClick={() => {
                        setPendingWhatsappTemplate(plantilla);
                        setSendError(null);
                      }}
                      type="button"
                    >
                      <strong>{plantilla.name}</strong>
                      <span>
                        {[plantilla.language, plantilla.category, plantilla.status]
                          .filter(Boolean)
                          .join(' · ') || 'Sin datos de Meta'}
                      </span>
                      {plantilla.previewText && <span>{plantilla.previewText}</span>}
                      {plantilla.blockedReason && <span>{plantilla.blockedReason}</span>}
                    </button>
                  ))}
                </div>
              )}
              {whatsappTemplatesError && (
                <p className="canned-response-error" role="alert">
                  {whatsappTemplatesError}
                </p>
              )}
              {/* Un mensaje de plantilla de Meta tiene coste y no se deshace: se confirma antes. */}
              {pendingWhatsappTemplate && (
                <div
                  aria-label="Confirmar envío de plantilla"
                  className="canned-response-picker"
                  role="dialog"
                >
                  <p>
                    Se enviará la plantilla <strong>{pendingWhatsappTemplate.name}</strong> (
                    {pendingWhatsappTemplate.language}) a{' '}
                    {selectedConversation?.contactName ?? 'este contacto'}. Es un mensaje de
                    plantilla de Meta: tiene coste y no se puede deshacer.
                  </p>
                  {pendingWhatsappTemplate.previewText && (
                    <p>{pendingWhatsappTemplate.previewText}</p>
                  )}
                  <div className="composer-actions">
                    <button
                      className="canned-response-trigger"
                      disabled={isSending}
                      onClick={() => void sendWhatsappTemplate(pendingWhatsappTemplate)}
                      type="button"
                    >
                      Enviar plantilla
                    </button>
                    <button
                      className="canned-response-trigger"
                      onClick={() => setPendingWhatsappTemplate(null)}
                      type="button"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              <textarea
                aria-label="Escribe una respuesta"
                disabled={isSending}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setSendError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey) return;
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }}
                placeholder="Escribe un mensaje… Enter envía, Shift+Enter agrega un salto de línea"
                rows={3}
                value={draft}
              />
              {sendError && (
                <p className="composer-error" role="alert">
                  {sendError}
                </p>
              )}
              <div className="composer-actions">
                <span>Selecciona una respuesta o escribe un mensaje</span>
                <button
                  aria-label={isSending ? 'Enviando' : 'Enviar'}
                  className="send-button"
                  disabled={!draft.trim() || isSending}
                  title="Enviar"
                  type="submit"
                >
                  <span aria-hidden="true">{isSending ? '…' : '➤'}</span>
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="empty-conversation">
            <Image
              alt="Inside Spa"
              className="empty-logo"
              height={100}
              src="/logo-inside-spa.png"
              width={100}
            />
            <h2>{inbox.kind === 'ready' ? 'Tu bandeja está vacía' : 'Bandeja segura'}</h2>
            <p>
              {inbox.kind === 'ready'
                ? 'Cuando llegue un mensaje por un canal conectado, aparecerá aquí.'
                : 'Estamos comprobando el acceso a tu información.'}
            </p>
          </div>
        )}
      </section>
      <div
        className={`details-drawer-backdrop ${isDetailsOpen ? 'open' : ''}`}
        onClick={() => setIsDetailsOpen(false)}
        role="presentation"
      />
      <aside
        className={`details-panel ${isDetailsOpen ? 'open' : ''}`}
        aria-label="Detalles del tenant"
      >
        <div className="details-heading">
          <span>Detalles</span>
          <button
            aria-label="Cerrar detalles"
            className="details-close"
            onClick={() => setIsDetailsOpen(false)}
            type="button"
          >
            ×
          </button>
        </div>
        {selectedConversation ? (
          <>
            <div className="profile-card">
              <div className="profile-avatar-wrap">
                <div className="profile-avatar avatar lavender">
                  {initials(selectedConversation.contactName)}
                </div>
                {hasContactAvatar(selectedConversation) && (
                  <img
                    alt=""
                    className="profile-avatar-image"
                    onError={() => markAvatarAsFailed(selectedConversation.contactId)}
                    src={`/api/contacts/${selectedConversation.contactId}/avatar`}
                  />
                )}
              </div>
              <h2>{selectedConversation.contactName}</h2>
              <p>Contacto de la conversación</p>
              <span className="channel-pill">
                Bot {selectedConversation.automationMode === 'auto' ? 'activado' : 'desactivado'}
              </span>
            </div>
            <section className="details-section attributes" aria-label="Resumen de la conversación">
              <div className="section-title">Resumen</div>
              <dl>
                <div>
                  <dt>Estado</dt>
                  <dd>{conversationStatusLabel(selectedConversation.status)}</dd>
                </div>
                <div>
                  <dt>Asignado a</dt>
                  <dd>{selectedAssignee ? memberLabel(selectedAssignee) : 'Sin asignar'}</dd>
                </div>
                <div>
                  <dt>Primer mensaje</dt>
                  <dd>
                    {formatConversationStamp(selectedConversation.startedAt ?? firstMessageAt)}
                  </dd>
                </div>
                <div>
                  <dt>Último mensaje</dt>
                  <dd>{formatConversationStamp(selectedConversation.lastMessageAt)}</dd>
                </div>
              </dl>
            </section>
            <section
              className="details-section conversation-management"
              aria-label="Acciones de conversación"
            >
              <div className="section-title">Acciones</div>
              <button
                className={`automation-action ${
                  selectedConversation.automationMode === 'auto' ? 'is-active' : 'is-paused'
                }`}
                disabled={isUpdatingAutomation}
                onClick={() =>
                  void changeConversationAutomation(
                    selectedConversation.automationMode === 'auto' ? 'paused' : 'auto'
                  )
                }
                type="button"
              >
                {selectedConversation.automationMode === 'auto' ? 'Desactivar bot' : 'Activar bot'}
              </button>
              <div className="conversation-actions" aria-label="Cambiar estado de conversación">
                {selectedConversation.status !== 'open' && (
                  <button
                    className="status-action"
                    disabled={isUpdatingStatus}
                    onClick={() => void changeConversationStatus('open')}
                    type="button"
                  >
                    Reabrir
                  </button>
                )}
                {selectedConversation.status !== 'pending' && (
                  <button
                    className="status-action"
                    disabled={isUpdatingStatus}
                    onClick={() => void changeConversationStatus('pending')}
                    type="button"
                  >
                    Pendiente
                  </button>
                )}
                {selectedConversation.status !== 'resolved' && (
                  <button
                    className="status-action"
                    disabled={isUpdatingStatus}
                    onClick={() => void changeConversationStatus('resolved')}
                    type="button"
                  >
                    Resolver
                  </button>
                )}
                <button
                  className="status-action"
                  disabled={isMarkingWon}
                  onClick={() => {
                    setWonError(null);
                    setIsWonDialogOpen(true);
                  }}
                  type="button"
                >
                  Ganado
                </button>
              </div>
              {statusError && (
                <p className="internal-label-error" role="alert">
                  {statusError}
                </p>
              )}
              {commentActionError && (
                <p className="internal-label-error" role="alert">
                  {commentActionError}
                </p>
              )}
              <div className="conversation-management-tools">
                <button
                  aria-expanded={isConversationLabelsOpen}
                  className="conversation-label-trigger"
                  disabled={isConversationLabelsLoading}
                  onClick={() => setIsConversationLabelsOpen((current) => !current)}
                  type="button"
                >
                  Etiquetas
                </button>
                {(tenant?.role === 'admin' || tenant?.role === 'supervisor') && (
                  <button
                    aria-expanded={isAssignmentOpen}
                    className="assignment-trigger"
                    disabled={isTenantMembersLoading || isUpdatingAssignment}
                    onClick={() => setIsAssignmentOpen((current) => !current)}
                    type="button"
                  >
                    Asignar
                  </button>
                )}
              </div>
            </section>
            <section className="details-section" aria-label="Etiquetas de la conversación">
              <div className="section-title">Etiquetas</div>
              <div className="tags">
                {conversationLabels.length > 0 ? (
                  conversationLabels.map((label) => (
                    <span className="tag purple" key={label.id}>
                      <span className="label-name-chip" style={{ backgroundColor: label.color }}>
                        {label.name}
                      </span>
                    </span>
                  ))
                ) : (
                  <span className="details-empty">Sin etiquetas todavía</span>
                )}
              </div>
              {conversationLabelsError && (
                <p className="internal-label-error" role="alert">
                  {conversationLabelsError}
                </p>
              )}
            </section>
            <section className="details-section private-notes" aria-label="Notas privadas">
              <div className="section-title">Notas privadas</div>
              <form className="private-note-form" onSubmit={saveConversationNote}>
                <textarea
                  aria-label="Nueva nota privada"
                  disabled={isSavingNote}
                  maxLength={2000}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="Agrega contexto solo para el equipo…"
                  rows={3}
                  value={noteDraft}
                />
                <button disabled={!noteDraft.trim() || isSavingNote} type="submit">
                  {isSavingNote ? 'Guardando…' : 'Guardar nota'}
                </button>
              </form>
              {notesError && (
                <p className="private-note-error" role="alert">
                  {notesError}
                </p>
              )}
              {isNotesLoading && <p className="details-empty">Cargando notas…</p>}
              {!isNotesLoading && !notesError && conversationNotes.length === 0 && (
                <p className="details-empty">Aún no hay notas privadas.</p>
              )}
              <div className="private-note-list">
                {conversationNotes.map((note) => (
                  <article className="private-note" key={note.id}>
                    <p>{note.body}</p>
                    <footer>
                      <span>{noteAuthorLabel(note)}</span>
                      <time>{formatMessageTime(note.createdAt)}</time>
                    </footer>
                  </article>
                ))}
              </div>
            </section>
            <p className="preview-note">
              Datos protegidos · visibles solo para el equipo autorizado.
            </p>
            {readMarkError && (
              <p className="internal-label-error" role="alert">
                {readMarkError}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="profile-card">
              <Image
                alt="Inside Spa"
                className="inside-spa-logo"
                height={100}
                src="/logo-inside-spa.png"
                width={100}
              />
              <h2>{tenant?.name ?? 'Inside Spa'}</h2>
              <p>{tenant ? `Rol: ${tenant.role}` : 'Sesión protegida'}</p>
              <span className="channel-pill">Acceso seguro</span>
              <label className="visually-hidden" htmlFor="conversation-platform-filter">
                Plataforma
              </label>
              <select
                aria-label="Filtrar por plataforma"
                className="status-select brand-platform"
                id="conversation-platform-filter"
                onChange={(event) => setPlatformFilter(event.target.value)}
                value={platformFilter}
              >
                <option value="">Todas</option>
                {channelPlatforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform.charAt(0).toUpperCase() + platform.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <p className="preview-note">Historial protegido · la bandeja consulta la API propia.</p>
          </>
        )}
      </aside>
      {isWonDialogOpen && selectedConversation && (
        <div
          className="channel-modal-backdrop"
          onClick={() => !isMarkingWon && setIsWonDialogOpen(false)}
          role="presentation"
        >
          <section
            aria-labelledby="won-dialog-title"
            className="channel-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <div>
                <p className="eyebrow">RESULTADO</p>
                <h2 id="won-dialog-title">Marcar como ganado</h2>
              </div>
              <button
                aria-label="Cerrar diálogo de ganado"
                className="channel-modal-close"
                disabled={isMarkingWon}
                onClick={() => setIsWonDialogOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>
            <form className="private-note-form" onSubmit={markConversationWon}>
              <label>
                Importe total
                <input
                  autoFocus
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setWonAmount(event.target.value)}
                  required
                  step="0.01"
                  type="number"
                  value={wonAmount}
                />
              </label>
              <label>
                Moneda
                <input
                  maxLength={3}
                  onChange={(event) => setWonCurrency(event.target.value.toUpperCase())}
                  pattern="[A-Z]{3}"
                  required
                  value={wonCurrency}
                />
              </label>
              {wonError && (
                <p className="channel-modal-error" role="alert">
                  {wonError}
                </p>
              )}
              <button disabled={isMarkingWon} type="submit">
                {isMarkingWon ? 'Guardando…' : 'Confirmar ganado'}
              </button>
            </form>
          </section>
        </div>
      )}
      {isChannelSetupOpen && (
        <div
          className="channel-modal-backdrop"
          onClick={() => setIsChannelSetupOpen(false)}
          role="presentation"
        >
          <section
            aria-labelledby="channel-setup-title"
            className="channel-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <div>
                <p className="eyebrow">CONFIGURACIÓN</p>
                <h2 id="channel-setup-title">Conectar canales</h2>
              </div>
              <button
                aria-label="Cerrar configuración de canales"
                autoFocus
                className="channel-modal-close"
                onClick={() => setIsChannelSetupOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>
            <p className="channel-modal-copy">
              Elige una plataforma. Zernio abrirá su autorización segura y la cuenta se agregará
              sola a esta bandeja.
            </p>
            {channelSetupError && (
              <p className="channel-modal-error" role="alert">
                {channelSetupError}
              </p>
            )}
            <div className="channel-connection-actions">
              {(['instagram', 'facebook', 'whatsapp', 'tiktok'] as const).map((platform) => (
                <button
                  className={`conversation-platform platform-${channelPlatformClass(platform)}`}
                  disabled={Boolean(connectingPlatform)}
                  key={platform}
                  onClick={() => void startChannelConnection(platform)}
                  type="button"
                >
                  {connectingPlatform === platform
                    ? 'Abriendo Zernio…'
                    : `Conectar ${channelPlatformLabel(platform)}`}
                </button>
              ))}
            </div>
            <section className="connected-channel-list" aria-label="Canales ya conectados">
              <h3>Canales conectados</h3>
              {isChannelsLoading && <p>Cargando canales…</p>}
              {!isChannelsLoading && connectedChannels.length === 0 && (
                <p>Aún no hay canales conectados.</p>
              )}
              {connectedChannels.map((channel) => (
                <div key={channel.id}>
                  <span
                    className={`conversation-platform platform-${channelPlatformClass(
                      channel.platform
                    )}`}
                  >
                    {channelPlatformLabel(channel.platform)}
                  </span>
                  {renamingChannelId === channel.id ? (
                    <form className="channel-rename-form" onSubmit={renameChannel}>
                      <input
                        aria-label="Nombre del canal"
                        autoFocus
                        maxLength={160}
                        onChange={(event) => setChannelNameDraft(event.target.value)}
                        placeholder="Ej. Instagram ventas"
                        value={channelNameDraft}
                      />
                      <button
                        className="channel-rename-save"
                        disabled={!channelNameDraft.trim() || isRenamingChannel}
                        type="submit"
                      >
                        {isRenamingChannel ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button
                        className="channel-rename-cancel"
                        disabled={isRenamingChannel}
                        onClick={() => {
                          setRenamingChannelId(null);
                          setChannelNameDraft('');
                          setChannelRenameError(null);
                        }}
                        type="button"
                      >
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    <>
                      <strong>{channel.displayName ?? 'Cuenta sin nombre'}</strong>
                      {tenant?.role === 'admin' && (
                        <button
                          className="channel-rename-trigger"
                          onClick={() => {
                            setRenamingChannelId(channel.id);
                            setChannelNameDraft(channel.displayName ?? '');
                            setChannelRenameError(null);
                          }}
                          type="button"
                        >
                          {channel.displayName ? 'Renombrar' : 'Nombrar'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
              {channelRenameError && (
                <p className="channel-rename-error" role="alert">
                  {channelRenameError}
                </p>
              )}
            </section>
          </section>
        </div>
      )}
      {isTeamOpen && tenant?.role === 'admin' && (
        <div
          className="channel-modal-backdrop"
          onClick={() => setIsTeamOpen(false)}
          role="presentation"
        >
          <section
            aria-labelledby="team-title"
            className="channel-modal channel-modal-wide"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <div>
                <p className="eyebrow">ACCESO</p>
                <h2 id="team-title">Equipo</h2>
              </div>
              <button
                aria-label="Cerrar equipo"
                autoFocus
                className="channel-modal-close"
                onClick={() => setIsTeamOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>
            <p className="channel-modal-copy">
              El administrador tiene acceso a todo. Los demás integrantes operan según su rol, y un
              tenant conserva siempre al menos un administrador.
            </p>
            {teamError && (
              <p className="channel-modal-error" role="alert">
                {teamError}
              </p>
            )}
            <section className="team-members" aria-label="Integrantes">
              <h3>Integrantes</h3>
              {isTenantMembersLoading && <p>Cargando integrantes…</p>}
              {!isTenantMembersLoading && tenantMembers.length === 0 && (
                <p>No hay integrantes en este tenant.</p>
              )}
              {tenantMembers.map((member) => (
                <div className="team-member" key={member.userId}>
                  <strong>{memberLabel(member)}</strong>
                  <select
                    aria-label={`Rol de ${memberLabel(member)}`}
                    disabled={updatingMemberId === member.userId}
                    onChange={(event) =>
                      void changeMemberRole(member, event.target.value as TenantMember['role'])
                    }
                    value={member.role}
                  >
                    <option value="admin">Administrador</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="agent">Agente</option>
                  </select>
                  <button
                    className="channel-rename-cancel"
                    disabled={updatingMemberId === member.userId}
                    onClick={() => void removeMember(member)}
                    type="button"
                  >
                    Retirar
                  </button>
                </div>
              ))}
            </section>
            <form className="team-invite" onSubmit={inviteMember}>
              <h3>Invitar</h3>
              <label>
                Correo
                <input
                  maxLength={200}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="persona@correo.com"
                  type="email"
                  value={inviteEmail}
                />
              </label>
              <label>
                Rol
                <select
                  onChange={(event) => setInviteRole(event.target.value as TenantMember['role'])}
                  value={inviteRole}
                >
                  <option value="agent">Agente</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Administrador</option>
                </select>
              </label>
              <button
                className="channel-rename-save"
                disabled={!inviteEmail.trim() || isInviting}
                type="submit"
              >
                {isInviting ? 'Generando…' : 'Generar invitación'}
              </button>
            </form>
            {inviteLink && (
              <section className="team-invite-link" aria-label="Enlace de invitación">
                <p>
                  Comparte este enlace con la persona. Es de un solo uso y solo se muestra aquí.
                </p>
                <input
                  aria-label="Enlace de invitación"
                  onFocus={(event) => event.currentTarget.select()}
                  readOnly
                  value={inviteLink}
                />
              </section>
            )}
          </section>
        </div>
      )}
      {activeView === 'metrics' && (
        <div className="metrics-view">
          <div className="metrics-view-header">
            <button className="metrics-back" onClick={() => setActiveView('inbox')} type="button">
              Volver a la bandeja
            </button>
            <h1>Actividad</h1>
          </div>
          <MetricsPanel days={metricsDays} onChangeDays={setMetricsDays} state={metrics} />
        </div>
      )}
      {activeView === 'reservations' && <ReservationsPanel />}
      {activeView === 'media' && (
        <section className="media-view" aria-label="Comprobantes de pago">
          <header className="media-view-header">
            <div>
              <p className="eyebrow">PAGOS</p>
              <h1>Comprobantes</h1>
            </div>
            <div className="media-view-actions">
              <label>
                Buscar por contacto
                <input
                  maxLength={80}
                  onChange={(event) => setMediaSearchInput(event.target.value)}
                  placeholder="Nombre del contacto"
                  type="search"
                  value={mediaSearchInput}
                />
              </label>
              <label>
                Tipo
                <select
                  onChange={(event) =>
                    setMediaKind(event.target.value as '' | MessageAttachment['kind'])
                  }
                  value={mediaKind}
                >
                  <option value="image">Comprobantes (imágenes)</option>
                  <option value="file">Archivos</option>
                  <option value="video">Vídeos</option>
                  <option value="audio">Audios</option>
                  <option value="share">Publicaciones compartidas</option>
                  <option value="">Todo</option>
                </select>
              </label>
              <button
                className="channel-rename-cancel"
                onClick={() => {
                  setActiveView('inbox');
                  setIsSettingsOpen(false);
                }}
                type="button"
              >
                Volver a la bandeja
              </button>
            </div>
          </header>
          <p className="media-view-copy">
            Todo lo que los contactos de pago que enviaron los clientes, con su nombre y la fecha.
            Lo más reciente primero.
          </p>
          {mediaError && (
            <p className="channel-modal-error" role="alert">
              {mediaError}
            </p>
          )}
          {isMediaLoading && <p>Cargando multimedia…</p>}
          {!isMediaLoading && mediaItems.length === 0 && (
            <p>Aún no hay comprobantes recibidos todavia.</p>
          )}
          <ul className="media-list" aria-label="Archivos recibidos">
            {mediaItems.map((item) => (
              <li className="media-row" key={item.id}>
                <button
                  aria-label={`Ver ${attachmentLabel(item.kind)} de ${item.contactName}`}
                  className="media-thumb"
                  onClick={() => setMediaPreview(item)}
                  type="button"
                >
                  {item.url && item.kind === 'image' ? (
                    <img alt="" loading="lazy" src={item.url} />
                  ) : item.url ? (
                    <video muted playsInline preload="metadata" src={item.url} />
                  ) : (
                    <span className="media-placeholder">{shortAttachmentLabel(item.kind)}</span>
                  )}
                  {item.url && item.kind !== 'image' && (
                    <span aria-hidden="true" className="media-play" />
                  )}
                </button>
                <div className="media-row-main">
                  <strong>{item.contactName}</strong>
                  <span className="media-row-meta">
                    {attachmentLabel(item.kind)} · {formatMediaDate(item.createdAt)}
                    {item.url ? '' : ' · sin copia disponible'}
                  </span>
                  {item.title && <span className="media-row-caption">{item.title}</span>}
                </div>
                <div className="media-row-actions">
                  <button onClick={() => setMediaPreview(item)} type="button">
                    Ver
                  </button>
                  <button
                    onClick={() => {
                      setSelectedConversationId(item.conversationId);
                      setActiveView('inbox');
                    }}
                    type="button"
                  >
                    Conversación
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {mediaNextCursor && (
            <button
              className="load-more-conversations"
              disabled={isMediaLoading}
              onClick={() => void loadMedia(false)}
              type="button"
            >
              {isMediaLoading ? 'Cargando…' : 'Cargar más'}
            </button>
          )}
          {mediaPreview && (
            <div
              className="media-preview"
              onClick={() => setMediaPreview(null)}
              role="presentation"
            >
              <figure onClick={(event) => event.stopPropagation()}>
                {mediaPreview.url && mediaPreview.kind === 'image' ? (
                  <img alt="" src={mediaPreview.url} />
                ) : mediaPreview.url && mediaPreview.kind === 'audio' ? (
                  <audio controls src={mediaPreview.url} />
                ) : mediaPreview.url && mediaPreview.kind === 'video' ? (
                  <video controls src={mediaPreview.url} />
                ) : (
                  <p>
                    {mediaPreview.url
                      ? `${attachmentLabel(mediaPreview.kind)} recibido. Ábrelo para verlo.`
                      : 'La copia de este archivo no está disponible.'}
                  </p>
                )}
                {mediaPreview.title && (
                  <p className="media-preview-caption">{mediaPreview.title}</p>
                )}
                <figcaption>
                  <strong>{mediaPreview.contactName}</strong>
                  {mediaPreview.url && mediaPreview.kind !== 'image' && (
                    <a href={mediaPreview.url} rel="noreferrer" target="_blank">
                      Abrir archivo
                    </a>
                  )}
                  {mediaPreview.conversationId && (
                    <button
                      onClick={() => {
                        setSelectedConversationId(mediaPreview.conversationId);
                        setMediaPreview(null);
                        setActiveView('inbox');
                      }}
                      type="button"
                    >
                      Ir a la conversación
                    </button>
                  )}
                  <button onClick={() => setMediaPreview(null)} type="button">
                    Cerrar
                  </button>
                </figcaption>
              </figure>
            </div>
          )}
        </section>
      )}
      {isSettingsOpen && (
        <section className="media-view" aria-label="Configuracion">
          <header className="media-view-header">
            <div>
              <p className="eyebrow">AJUSTES</p>
              <h1>Configuracion</h1>
            </div>
            <button
              className="channel-rename-cancel"
              onClick={() => setIsSettingsOpen(false)}
              type="button"
            >
              Cerrar
            </button>
          </header>
          <p className="media-view-copy">
            Crea y ordena lo que el equipo reutiliza: las etiquetas para clasificar conversaciones y
            las respuestas rapidas para contestar sin repetir texto.
          </p>
          <div className="settings-cards">
            {(tenant?.role === 'admin' || tenant?.role === 'supervisor') && (
              <button
                className="settings-card"
                onClick={() => {
                  resetInternalLabelEditor();
                  setIsInternalLabelManagerOpen(true);
                }}
                type="button"
              >
                <strong>Etiquetas</strong>
                <span>Clasifica las conversaciones para encontrarlas despues.</span>
              </button>
            )}
            <button
              className="settings-card"
              onClick={() => {
                resetCannedResponseEditor();
                setIsCannedResponseManagerOpen(true);
              }}
              type="button"
            >
              <strong>Respuestas rapidas</strong>
              <span>
                Textos que el equipo reutiliza al responder. Cada quien administra los suyos.
              </span>
            </button>
            {(tenant?.role === 'admin' || tenant?.role === 'supervisor') && (
              <button
                className="settings-card"
                onClick={() => void openBranchMediaManager()}
                type="button"
              >
                <strong>Multimedia por sede</strong>
                <span>
                  Las fotos y videos que el bot comparte de cada sucursal. Se importan desde un
                  enlace publico.
                </span>
              </button>
            )}
          </div>
          <p className="media-view-copy">
            Los canales conectados se administran aparte, con el icono de Canales.
          </p>
        </section>
      )}{' '}
      {isBranchMediaOpen && (tenant?.role === 'admin' || tenant?.role === 'supervisor') && (
        <section className="internal-label-manager" aria-label="Multimedia por sede">
          <div className="internal-label-manager-heading">
            <strong>Multimedia por sede</strong>
            <button
              aria-label="Cerrar multimedia por sede"
              onClick={() => setIsBranchMediaOpen(false)}
              type="button"
            >
              ×
            </button>
          </div>
          <label>
            Sede
            <select
              onChange={(event) => {
                setBranchMediaSlug(event.target.value);
                void loadBranchMedia(event.target.value);
              }}
              value={branchMediaSlug}
            >
              {branchMediaBranches.map((sede) => (
                <option key={sede.slug} value={sede.slug}>
                  {sede.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Enlace publico del archivo
            <input
              maxLength={2048}
              onChange={(event) => setBranchMediaSourceUrl(event.target.value)}
              placeholder="https://…"
              value={branchMediaSourceUrl}
            />
          </label>
          <label>
            Titulo (opcional)
            <input
              maxLength={160}
              onChange={(event) => setBranchMediaTitle(event.target.value)}
              placeholder="Ej. Fachada"
              value={branchMediaTitle}
            />
          </label>
          <div className="internal-label-manager-actions">
            <button
              className="internal-label-save"
              disabled={!branchMediaSlug || !branchMediaSourceUrl.trim() || isImportingBranchMedia}
              onClick={() => void importBranchMedia()}
              type="button"
            >
              {isImportingBranchMedia ? 'Importando…' : 'Importar'}
            </button>
          </div>
          {branchMediaNotice && <p className="media-view-copy">{branchMediaNotice}</p>}
          {isLoadingBranchMedia ? (
            <p className="media-view-copy">Cargando…</p>
          ) : branchMediaItems.length === 0 ? (
            <p className="media-view-copy">Esta sede todavia no tiene material.</p>
          ) : (
            <ul className="branch-media-list">
              {branchMediaItems.map((item) => (
                <li className="branch-media-list-item" key={item.id}>
                  {item.url ? (
                    <img alt={item.title ?? 'Material de la sede'} loading="lazy" src={item.url} />
                  ) : (
                    // Sin copia en el almacen no hay enlace: se dice, en vez de dejar un hueco.
                    <span className="branch-media-missing">Falta el archivo</span>
                  )}
                  <span>{item.title ?? 'Sin titulo'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {isInternalLabelManagerOpen &&
        (tenant?.role === 'admin' || tenant?.role === 'supervisor') && (
          <section className="internal-label-manager" aria-label="Administrar etiquetas">
            <div className="internal-label-manager-heading">
              <strong>{editingInternalLabel ? 'Editar etiqueta' : 'Nueva etiqueta'}</strong>
              <button
                aria-label="Cerrar administración de etiquetas"
                onClick={() => {
                  setIsInternalLabelManagerOpen(false);
                  resetInternalLabelEditor();
                }}
                type="button"
              >
                ×
              </button>
            </div>
            <label>
              Nombre de etiqueta
              <input
                maxLength={64}
                onChange={(event) => setInternalLabelName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.preventDefault();
                }}
                placeholder="Ej. Prioridad alta"
                value={internalLabelName}
              />
            </label>
            <div className="internal-label-manager-actions">
              <button
                className="internal-label-save"
                disabled={!internalLabelName.trim() || isSavingInternalLabel}
                onClick={() => void saveInternalLabel()}
                type="button"
              >
                {isSavingInternalLabel ? 'Guardando…' : 'Guardar'}
              </button>
              {editingInternalLabel && (
                <button
                  className="internal-label-cancel"
                  disabled={isSavingInternalLabel}
                  onClick={resetInternalLabelEditor}
                  type="button"
                >
                  Cancelar edición
                </button>
              )}
            </div>
            <div className="internal-label-library" aria-label="Biblioteca de etiquetas">
              {internalLabels.map((label) => (
                <div className="internal-label-library-item" key={label.id}>
                  <strong className="label-name-chip" style={{ backgroundColor: label.color }}>
                    {label.name}
                  </strong>
                  <div>
                    <button
                      disabled={isSavingInternalLabel}
                      onClick={() => startEditingInternalLabel(label)}
                      type="button"
                    >
                      Editar
                    </button>
                    <button
                      disabled={isSavingInternalLabel}
                      onClick={() => void deleteInternalLabel(label)}
                      type="button"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      {isCannedResponseManagerOpen && (
        <section className="canned-response-manager" aria-label="Administrar respuestas rápidas">
          <div className="canned-response-manager-heading">
            <strong>{editingCannedResponse ? 'Editar respuesta' : 'Nueva respuesta'}</strong>
            <button
              aria-label="Cerrar administración de respuestas rápidas"
              onClick={() => {
                setIsCannedResponseManagerOpen(false);
                resetCannedResponseEditor();
              }}
              type="button"
            >
              ×
            </button>
          </div>
          <label>
            Nombre corto
            <input
              maxLength={80}
              onChange={(event) => setCannedResponseTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
              placeholder="Ej. Horarios de atención"
              value={cannedResponseTitle}
            />
          </label>
          <label>
            Mensaje
            <textarea
              maxLength={8000}
              onChange={(event) => setCannedResponseBody(event.target.value)}
              placeholder="Escribe el texto que el equipo podrá reutilizar…"
              rows={3}
              value={cannedResponseBody}
            />
          </label>
          <div className="canned-response-manager-actions">
            <button
              className="canned-response-save"
              disabled={
                !cannedResponseTitle.trim() || !cannedResponseBody.trim() || isSavingCannedResponse
              }
              onClick={() => void saveCannedResponse()}
              type="button"
            >
              {isSavingCannedResponse ? 'Guardando…' : 'Guardar'}
            </button>
            {editingCannedResponse && (
              <button
                className="canned-response-cancel"
                disabled={isSavingCannedResponse}
                onClick={resetCannedResponseEditor}
                type="button"
              >
                Cancelar edición
              </button>
            )}
          </div>
          <div className="canned-response-library" aria-label="Biblioteca de respuestas rápidas">
            {cannedResponses.map((response) => (
              <div className="canned-response-library-item" key={response.id}>
                <div>
                  <strong>{response.title}</strong>
                  <p>{response.body}</p>
                </div>
                <div>
                  {response.canManage ? (
                    <>
                      <button
                        disabled={isSavingCannedResponse}
                        onClick={() => startEditingCannedResponse(response)}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        disabled={isSavingCannedResponse}
                        onClick={() => void deleteCannedResponse(response)}
                        type="button"
                      >
                        Eliminar
                      </button>
                    </>
                  ) : (
                    <span className="canned-response-owner-note">La creó otra persona</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {isProfileOpen && (
        <div
          className="channel-modal-backdrop"
          onClick={() => setIsProfileOpen(false)}
          role="presentation"
        >
          <section
            aria-labelledby="profile-title"
            className="channel-modal channel-modal-wide"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <div>
                <p className="eyebrow">TU CUENTA</p>
                <h2 id="profile-title">Mi perfil</h2>
              </div>
              <button
                aria-label="Cerrar mi perfil"
                autoFocus
                className="channel-modal-close"
                onClick={() => setIsProfileOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>
            <p className="channel-modal-copy">
              Este nombre es el que verán tus compañeros en las notas y en las asignaciones, en
              lugar de tu correo.
            </p>
            {profileError && (
              <p className="channel-modal-error" role="alert">
                {profileError}
              </p>
            )}
            <form className="team-invite" onSubmit={saveOwnProfile}>
              <label>
                Correo
                <input readOnly value={ownProfile?.email ?? ''} />
              </label>
              <label>
                Nombre visible
                <input
                  maxLength={80}
                  onChange={(event) => setProfileNameDraft(event.target.value)}
                  placeholder="Ej. Sara"
                  value={profileNameDraft}
                />
              </label>
              <button
                className="channel-rename-save"
                disabled={!profileNameDraft.trim() || isSavingProfile}
                type="submit"
              >
                {isSavingProfile ? 'Guardando…' : 'Guardar'}
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

type MetricsPayload = {
  closedConversations: number;
  closure: { byAdvisor: number; byBot: number };
  error?: string;
  messagesByChannel: Array<{ platform: string; received: number; sent: number }>;
  messagesPerDay: Array<{ date: string; received: number; sent: number }>;
  participants: Array<{
    averageFirstResponseSeconds: number | null;
    closedConversations: number;
    firstResponses: number;
    kind: 'advisor' | 'bot';
    label: string;
    messagesSent: number;
  }>;
  periodDays: number;
  responseTime: {
    averageSeconds: number | null;
    betweenFiveAndTenMinutes: number;
    conversations: number;
    overTenMinutes: number;
    thresholds: { amberSeconds: number; redSeconds: number };
    underFiveMinutes: number;
  };
  totalMessages: number;
  truncated: boolean;
};

type MetricsState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: MetricsPayload }
  | { kind: 'error'; message: string };

/** Espera legible: segundos si no llega al minuto, y minutos con los segundos que sobran. */
function esperaEnPalabras(segundos: number | null): string {
  if (segundos === null) return 'Sin datos';
  if (segundos < 60) return String(segundos) + ' s';
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return resto ? minutos + ' min ' + resto + ' s' : minutos + ' min';
}

/**
 * Color de una espera segun la politica de la API.
 *
 * Los limites no se escriben aqui: viajan en la respuesta para que cambiar la politica no obligue a
 * tocar la pantalla, y para que no haya dos versiones del mismo numero.
 */
function colorDeEspera(
  segundos: number | null,
  thresholds: { amberSeconds: number; redSeconds: number }
): string {
  if (segundos === null) return 'sin-datos';
  if (segundos > thresholds.redSeconds) return 'alto';
  if (segundos >= thresholds.amberSeconds) return 'aviso';
  return 'ok';
}

/** Los tres tramos de espera, con su etiqueta construida a partir de los limites recibidos. */
function tramosDeEspera(responseTime: MetricsPayload['responseTime']) {
  const minutos = (segundos: number) => Math.round(segundos / 60);
  const { amberSeconds, redSeconds } = responseTime.thresholds;
  return [
    {
      clave: 'ok',
      color: 'ok',
      etiqueta: 'Menos de ' + minutos(amberSeconds) + ' min',
      valor: responseTime.underFiveMinutes
    },
    {
      clave: 'aviso',
      color: 'aviso',
      etiqueta: 'Entre ' + minutos(amberSeconds) + ' y ' + minutos(redSeconds) + ' min',
      valor: responseTime.betweenFiveAndTenMinutes
    },
    {
      clave: 'alto',
      color: 'alto',
      etiqueta: 'Mas de ' + minutos(redSeconds) + ' min',
      valor: responseTime.overTenMinutes
    }
  ];
}

/**
 * Panel de actividad: cuantos mensajes llegan, por donde, y cuantas conversaciones se cerraron.
 *
 * Las cifras llegan ya calculadas por la API; aqui solo se pintan. Si el total es un minimo porque
 * se alcanzo el tope de lectura, se dice explicitamente en lugar de mostrar un numero falso.
 */
function MetricsPanel({
  days,
  onChangeDays,
  state
}: {
  days: number;
  onChangeDays: (days: number) => void;
  state: MetricsState;
}) {
  const maximo =
    state.kind === 'ready'
      ? Math.max(1, ...state.data.messagesPerDay.map((dia) => dia.received + dia.sent))
      : 1;
  const [selectedParticipant, setSelectedParticipant] = useState<
    MetricsPayload['participants'][number] | null
  >(null);

  return (
    <section className="metrics-panel">
      <div className="metrics-period">
        <span className="metrics-card-label">Periodo</span>
        <select onChange={(event) => onChangeDays(Number(event.target.value))} value={days}>
          <option value={7}>Ultimos 7 dias</option>
          <option value={30}>Ultimos 30 dias</option>
          <option value={90}>Ultimos 90 dias</option>
        </select>
      </div>

      {state.kind === 'loading' && <p className="metrics-note">Cargando actividad...</p>}
      {state.kind === 'error' && <p className="metrics-note">{state.message}</p>}

      {state.kind === 'ready' && (
        <>
          <div className="metrics-cards">
            <div className="metrics-card">
              <p className="metrics-card-label">Mensajes en el periodo</p>
              <p className="metrics-card-value">{state.data.totalMessages}</p>
            </div>
            <div className="metrics-card">
              <p className="metrics-card-label">Conversaciones cerradas</p>
              <p className="metrics-card-value">{state.data.closedConversations}</p>
              <p className="metrics-hint">
                {state.data.closure.byBot} por el bot · {state.data.closure.byAdvisor} por un asesor
              </p>
            </div>
            <div className="metrics-card">
              <p className="metrics-card-label">Respuesta del asesor</p>
              <p className="metrics-card-value">
                {esperaEnPalabras(state.data.responseTime.averageSeconds)}
              </p>
              <p
                className={
                  'metrics-hint ' +
                  colorDeEspera(
                    state.data.responseTime.averageSeconds,
                    state.data.responseTime.thresholds
                  )
                }
              >
                <span
                  className={
                    'metrics-dot ' +
                    colorDeEspera(
                      state.data.responseTime.averageSeconds,
                      state.data.responseTime.thresholds
                    )
                  }
                />
                {state.data.responseTime.conversations} conversaciones medidas
              </p>
            </div>
            <div className="metrics-card">
              <p className="metrics-card-label">Canales con actividad</p>
              <p className="metrics-card-value">{state.data.messagesByChannel.length}</p>
            </div>
          </div>

          <div className="metrics-block">
            <h3>Actividad por asesor y Bot</h3>
            {state.data.participants.length === 0 ? (
              <p className="metrics-note">Sin respuestas del Bot ni de asesores en este periodo.</p>
            ) : (
              state.data.participants.map((participant) => (
                <div className="metrics-row" key={participant.label}>
                  <span className="metrics-row-name">
                    <span
                      className={'metrics-dot ' + (participant.kind === 'bot' ? 'aviso' : 'ok')}
                    />
                    {participant.label}
                  </span>
                  <span
                    className="metrics-bar"
                    style={{
                      width: String(Math.max(8, Math.min(100, participant.messagesSent * 10))) + '%'
                    }}
                  >
                    <span />
                  </span>
                  <span className="metrics-row-values">
                    {participant.messagesSent} respuestas enviadas
                  </span>
                  <button
                    className="metrics-detail-button"
                    onClick={() => setSelectedParticipant(participant)}
                    type="button"
                  >
                    Detalles
                  </button>
                </div>
              ))
            )}
          </div>
          {selectedParticipant && (
            <div className="metrics-participant-detail">
              <button onClick={() => setSelectedParticipant(null)} type="button">
                ×
              </button>
              <h3>{selectedParticipant.label}</h3>
              <p>
                Tiempo promedio de primera respuesta:{' '}
                <strong>{esperaEnPalabras(selectedParticipant.averageFirstResponseSeconds)}</strong>
              </p>
              <p>
                {selectedParticipant.firstResponses} conversaciones medidas ·{' '}
                {selectedParticipant.messagesSent} respuestas enviadas
              </p>
            </div>
          )}

          <div className="metrics-block">
            <h3>Cuánto esperó el cliente</h3>
            {state.data.responseTime.conversations === 0 ? (
              <p className="metrics-note">
                Ningún asesor respondió en este periodo, así que no hay espera que medir.
              </p>
            ) : (
              tramosDeEspera(state.data.responseTime).map((tramo) => (
                <div className="metrics-row" key={tramo.clave}>
                  <span className="metrics-row-name">
                    <span className={'metrics-dot ' + tramo.color} />
                    {tramo.etiqueta}
                  </span>
                  <span className="metrics-row-values">
                    {tramo.valor} {tramo.valor === 1 ? 'conversación' : 'conversaciones'}
                  </span>
                </div>
              ))
            )}
          </div>

          {state.data.truncated && (
            <p className="metrics-note">
              Se alcanzo el tope de lectura: las cifras son un minimo, no el total.
            </p>
          )}

          <div className="metrics-block">
            <h3>Mensajes por dia</h3>
            {state.data.messagesPerDay.length === 0 ? (
              <p className="metrics-note">Sin actividad en este periodo.</p>
            ) : (
              state.data.messagesPerDay.map((dia) => (
                <div className="metrics-row" key={dia.date}>
                  <span className="metrics-row-name">{dia.date}</span>
                  <span
                    className="metrics-bar"
                    style={{
                      width: String(Math.round(((dia.received + dia.sent) / maximo) * 100)) + '%'
                    }}
                  >
                    <span />
                  </span>
                  <span className="metrics-row-values">
                    {dia.received} recibidos · {dia.sent} enviados
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="metrics-block">
            <h3>Mensajes por canal</h3>
            {state.data.messagesByChannel.length === 0 ? (
              <p className="metrics-note">Sin actividad en este periodo.</p>
            ) : (
              state.data.messagesByChannel.map((canal) => (
                <div className="metrics-row" key={canal.platform}>
                  <span className="metrics-row-name">{canal.platform}</span>
                  <span className="metrics-row-values">
                    {canal.received} recibidos · {canal.sent} enviados
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
