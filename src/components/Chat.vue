<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiData } from '../stores/data';
import { nanoid } from 'nanoid';

interface FileContent {
  id: string;
  filename: string;
  type: string;
  size?: number;
}

interface ChatMessage {
  id: string;
  source_id: string;
  target_id: string;
  kind: 'text' | 'file' | 'image' | 'video';
  content: string | FileContent;
  timestamp: number;
  isSelf: boolean;
}

const props = defineProps<{
  myId?: string;
}>();

const route = useRoute();
const router = useRouter();

const messages = ref<ChatMessage[]>([]);
const messageText = ref('');
// Initialize from route param or default to 'broadcast' (Global Chat)
const selectedPeerId = ref<string | null>((route.params.peerId as string) || 'broadcast');
const socket = ref<WebSocket | null>(null);
const isConnected = ref(false);
const lastPong = ref(0);
let heartbeatTimer: number | null = null;
const fileInput = ref<HTMLInputElement | null>(null);
const showLocalFileModal = ref(false);
const localFilePath = ref('');

// Get peers from global store, excluding self, and add Broadcast
const peers = computed(() => {
  const list = [];
  // Add Broadcast option
  list.push({ id: 'broadcast', addresses: [] });

  if (!apiData.value?.peers) return list;
  const myId = apiData.value.peer_id;

  apiData.value.peers.forEach(p => {
    if (p.id !== myId) list.push(p);
  });
  return list;
});

// Filter messages for selected peer
const currentMessages = computed(() => {
  if (!selectedPeerId.value) return [];
  return messages.value.filter(m => {
    if (selectedPeerId.value === 'broadcast') {
      // Show broadcast messages (target is null/undefined or 'broadcast')
      return !m.target_id || m.target_id === 'broadcast';
    }
    // Direct messages
    return (m.source_id === selectedPeerId.value && (m.target_id === apiData.value?.peer_id)) ||
      (m.target_id === selectedPeerId.value && m.isSelf);
  }).sort((a, b) => a.timestamp - b.timestamp);
});

const stopHeartbeat = () => {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
};

const startHeartbeat = () => {
  stopHeartbeat();
  heartbeatTimer = window.setInterval(() => {
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (lastPong.value && now - lastPong.value > 15000) {
      socket.value.close();
      return;
    }
    socket.value.send(JSON.stringify({ kind: 'ping' }));
  }, 5000);
};

const connect = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/ws`;

  socket.value = new WebSocket(wsUrl);

  socket.value.onopen = () => {
    isConnected.value = true;
    lastPong.value = Date.now();
    startHeartbeat();
    console.log('WS Connected');
  };

  socket.value.onclose = () => {
    isConnected.value = false;
    stopHeartbeat();
    console.log('WS Disconnected');
    // Reconnect after delay
    setTimeout(connect, 3000);
  };

  socket.value.onerror = () => {
    socket.value?.close();
  };

  socket.value.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);

      // Filter system messages if any leak through
      if (msg.kind === 'pong') {
        lastPong.value = Date.now();
        return;
      }
      if (['ping', 'sync'].includes(msg.kind)) return;

      const chatMsg: ChatMessage = {
        id: msg.id,
        source_id: msg.source_id,
        target_id: msg.target_id || 'broadcast',
        kind: (msg.kind as 'text' | 'file' | 'image' | 'video') || 'text',
        content: msg.content,
        timestamp: msg.timestamp || Date.now(),
        isSelf: msg.source_id === apiData.value?.peer_id
      };

      messages.value.push(chatMsg);
    } catch (e) {
      console.error('Failed to parse message:', e);
    }
  };
};

const sendMessage = async () => {
  if (!messageText.value.trim() || !selectedPeerId.value || !socket.value) return;

  const payload = {
    target: selectedPeerId.value,
    kind: 'text',
    content: messageText.value
  };

  socket.value.send(JSON.stringify(payload));

  // Optimistically add to UI
  messages.value.push({
    id: nanoid(),
    source_id: apiData.value?.peer_id || 'me',
    target_id: selectedPeerId.value,
    kind: 'text',
    content: messageText.value,
    timestamp: Date.now(),
    isSelf: true
  });

  messageText.value = '';
};

const handleFileUpload = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    // Upload file content to object store
    const response = await fetch('/api/object', {
      method: 'POST',
      body: file
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    const result = await response.json();
    const objectId = result.id;

    // Determine kind based on type
    const kind = file.type.startsWith('image/')
      ? 'image'
      : (file.type.startsWith('video/') ? 'video' : 'file');

    // Construct file content object
    const fileContent: FileContent = {
      id: objectId,
      filename: file.name, // Use original filename for display
      type: file.type,
      size: file.size
    };

    const payload = {
      target: selectedPeerId.value,
      kind: kind,
      content: fileContent
    };

    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      socket.value.send(JSON.stringify(payload));

      // Optimistically add
      messages.value.push({
        id: nanoid(),
        source_id: apiData.value?.peer_id || 'me',
        target_id: selectedPeerId.value!,
        kind: kind,
        content: fileContent,
        timestamp: Date.now(),
        isSelf: true
      });
    }
  } catch (e) {
    console.error('File upload error:', e);
    alert('Failed to upload file');
  }

  // Reset input
  if (fileInput.value) fileInput.value.value = '';
};

const handleLocalFileRegistration = async () => {
  if (!localFilePath.value || !localFilePath.value.trim()) return;
  const path = localFilePath.value;

  try {
    const response = await fetch('/api/object/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: path.trim() })
    });

    if (!response.ok) {
      throw new Error('Registration failed');
    }

    const result = await response.json();
    const objectId = result.id;

    // Extract filename from path
    const filename = path.split(/[/\\]/).pop() || 'local-file';

    const fileContent: FileContent = {
      id: objectId,
      filename: filename,
      type: 'application/octet-stream',
      size: 0 // Size unknown for local registration
    };

    const payload = {
      target: selectedPeerId.value,
      kind: 'file',
      content: fileContent
    };

    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      socket.value.send(JSON.stringify(payload));

      messages.value.push({
        id: nanoid(),
        source_id: apiData.value?.peer_id || 'me',
        target_id: selectedPeerId.value!,
        kind: 'file',
        content: fileContent,
        timestamp: Date.now(),
        isSelf: true
      });
    }

    // Close modal and clear input
    showLocalFileModal.value = false;
    localFilePath.value = '';

  } catch (e) {
    console.error('Local file registration error:', e);
    alert('Failed to register local file');
  }
};

onMounted(() => {
  connect();
});

onUnmounted(() => {
  stopHeartbeat();
  if (socket.value) socket.value.close();
});

// Auto-scroll to bottom
watch(currentMessages, (newVal, oldVal) => {
  const el = document.getElementById('chat-messages');
  if (!el) return;

  // Check if we are already at the bottom before the update (threshold 50px)
  const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;

  nextTick(() => {
    // Only scroll if we were at the bottom OR if the last message is from self
    const lastMsg = newVal[newVal.length - 1];
    if (isAtBottom || (lastMsg && lastMsg.isSelf)) {
      el.scrollTop = el.scrollHeight;
    }
  });
}, { deep: true });

// Sync URL with selected peer
watch(selectedPeerId, (newId) => {
  if (newId) {
    router.replace({ name: 'chat', params: { peerId: newId } });
  }
});

// Sync selected peer with URL
watch(() => route.params.peerId, (newId) => {
  if (newId) {
    selectedPeerId.value = newId as string;
  } else {
    selectedPeerId.value = 'broadcast';
  }
});

const formatTime = (ts: number) => new Date(ts).toLocaleTimeString();

const formatBytes = (size?: number) => {
  if (!size || size <= 0) return '未知大小';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
};

const copyText = async (msg: ChatMessage) => {
  if (msg.kind !== 'text') return;
  const text = String(msg.content ?? '');
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.focus();
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
};

const downloadFile = (msg: ChatMessage) => {
  const content = msg.content as FileContent;
  const url = getDownloadUrl(msg);
  const a = document.createElement('a');
  a.href = url;
  a.download = content.filename || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const getDownloadUrl = (msg: ChatMessage) => {
  const content = msg.content as FileContent;
  const filename = encodeURIComponent(content.filename || 'file');
  return `/api/object/${content.id}?peer=${msg.source_id}&filename=${filename}`;
};
</script>

<template>
  <div class="card bg-base-100 h-[calc(100vh-12rem)] md:h-[600px] flex flex-row overflow-hidden relative">
    <!-- Sidebar: Peer List -->
    <div
      class="w-full md:w-80 border-r border-base-300 flex flex-col bg-base-200 transition-all duration-300 absolute md:relative z-10 h-full"
      :class="{ '-translate-x-full md:translate-x-0': selectedPeerId }">
      <div class="p-4 font-bold flex justify-between items-center bg-base-200 sticky top-0 z-10">
        <span class="text-lg">Peers</span>
        <div class="badge badge-sm" :class="isConnected ? 'badge-success' : 'badge-error'">
          {{ isConnected ? 'Online' : 'Offline' }}
        </div>
      </div>
      <div class="overflow-y-auto flex-1 px-2 pb-2">
        <ul class="menu w-full p-0 gap-1">
          <li v-for="peer in peers" :key="peer.id">
            <a @click="selectedPeerId = peer.id" :class="{ 'active': selectedPeerId === peer.id }"
              class="flex items-center gap-3 py-3 px-4 rounded-btn transition-all duration-200">
              <div class="w-10 h-10 rounded-full bg-base-300 flex items-center justify-center"
                :class="{ 'ring-2 ring-primary ring-offset-2': selectedPeerId === peer.id }">
                <svg v-if="peer.id === 'broadcast'" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                  stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 018.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.43.816 1.035.816 1.73 0 .695-.321 1.3-.816 1.73m0-3.46a24.347 24.347 0 010 3.46" />
                </svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                  stroke="currentColor" class="w-6 h-6">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <div class="flex flex-col overflow-hidden">
                <span class="font-bold truncate text-sm">
                  {{ peer.id === 'broadcast' ? 'Global Chat' : peer.id.substring(0, 12) + '...' }}
                </span>
                <span class="text-xs opacity-50 truncate">
                  {{ peer.id === 'broadcast' ? 'Broadcast to all' : 'Online' }}
                </span>
              </div>
            </a>
          </li>
          <li v-if="peers.length === 0" class="text-center opacity-50 p-8 flex flex-col items-center gap-2 mt-10">
            <span class="text-5xl grayscale opacity-50">😴</span>
            <span class="font-medium">No peers found</span>
            <span class="text-xs">Waiting for connections...</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- Main Chat Area -->
    <div class="flex-1 flex flex-col bg-base-100 relative w-full md:w-auto">
      <div v-if="!selectedPeerId" class="hero h-full bg-base-200/30">
        <div class="hero-content text-center">
          <div class="max-w-md">
            <div class="text-6xl mb-4">👋</div>
            <h1 class="text-3xl font-bold">Hello there!</h1>
            <p class="py-6 opacity-70">Select a peer from the sidebar to start chatting or sharing files securely.</p>
            <button class="btn btn-primary" @click="selectedPeerId = 'broadcast'">Join Global Chat</button>
          </div>
        </div>
      </div>

      <template v-else>
        <!-- Header -->
        <div
          class="p-3 border-b border-base-300 bg-base-100/95 backdrop-blur flex justify-between items-center z-10 sticky top-0">
          <div class="font-bold flex items-center gap-3">
            <!-- Mobile Sidebar Toggle -->
            <button class="btn btn-circle btn-ghost btn-sm md:hidden -ml-2 mr-1" @click="selectedPeerId = null">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
                stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div class="w-10 h-10 rounded-full bg-base-300 flex items-center justify-center">
              <svg v-if="selectedPeerId === 'broadcast'" xmlns="http://www.w3.org/2000/svg" fill="none"
                viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 018.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.43.816 1.035.816 1.73 0 .695-.321 1.3-.816 1.73m0-3.46a24.347 24.347 0 010 3.46" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div class="flex flex-col">
              <span class="text-lg">{{ selectedPeerId === 'broadcast' ? 'Global Chat' : selectedPeerId.substring(0, 12)
                + '...' }}</span>
              <span class="text-xs opacity-50 font-normal" v-if="selectedPeerId !== 'broadcast'">Direct Message</span>
            </div>
          </div>
        </div>

        <!-- Messages -->
        <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-6 bg-base-200/30 scroll-smooth">
          <div v-for="msg in currentMessages" :key="msg.id" class="chat group"
            :class="msg.isSelf ? 'chat-end' : 'chat-start'">

            <div class="chat-image avatar">
              <div class="w-8 h-8 rounded-full bg-base-300 flex items-center justify-center opacity-70">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                  stroke="currentColor" class="w-5 h-5">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
            </div>

            <div class="chat-header text-xs opacity-50 mb-1 flex items-center gap-2">
              <span class="font-bold">{{ msg.isSelf ? 'You' : msg.source_id }}</span>
              <time class="text-[10px]">{{ formatTime(msg.timestamp) }}</time>
            </div>

            <div class="chat-bubble" :class="msg.isSelf ? 'chat-bubble-primary' : 'chat-bubble-secondary'">
              <!-- Text Message -->
              <div v-if="msg.kind === 'text'" class="flex items-start gap-2">
                <span class="whitespace-pre-wrap flex-1">{{ msg.content }}</span>
                <button class="btn btn-ghost btn-square btn-xs" @click="copyText(msg)" title="复制">
                  <svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>
                    <g id="copy_3_line" fill='none' fill-rule='evenodd'>
                      <path
                        d='M24 0v24H0V0zM12.593 23.258l-.011.002-.071.035-.02.004-.014-.004-.071-.035c-.01-.004-.019-.001-.024.005l-.004.01-.017.428.005.02.01.013.104.074.015.004.012-.004.104-.074.012-.016.004-.017-.017-.427c-.002-.01-.009-.017-.017-.018m.265-.113-.013.002-.185.093-.01.01-.003.011.018.43.005.012.008.007.201.093c.012.004.023 0 .029-.008l.004-.014-.034-.614c-.003-.012-.01-.02-.02-.022m-.715.002a.023.023 0 0 0-.027.006l-.006.014-.034.614c0 .012.007.02.017.024l.015-.002.201-.093.01-.008.004-.011.017-.43-.003-.012-.01-.01z' />
                      <path fill='currentColor'
                        d='M9 2a2 2 0 0 0-2 2v1a1 1 0 0 0 2 0V4h1a1 1 0 1 0 0-2zm5 0a1 1 0 1 0 0 2h1a1 1 0 1 0 0-2zm5 0a1 1 0 1 0 0 2h1v1a1 1 0 1 0 2 0V4a2 2 0 0 0-2-2zm3 7a1 1 0 1 0-2 0v1a1 1 0 1 0 2 0zm0 5a1 1 0 1 0-2 0v1h-1a1 1 0 1 0 0 2h1a2 2 0 0 0 2-2zM4 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zm0 2h11v11H4z' />
                    </g>
                  </svg>
                </button>
              </div>

              <!-- Image Message -->
              <div v-else-if="msg.kind === 'image'" class="flex flex-col gap-2">
                <img :src="getDownloadUrl(msg)" class="max-w-[200px] rounded-lg border border-base-content/20" />
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs opacity-70">{{ (msg.content as FileContent).filename }}</span>
                  <button class="btn btn-ghost btn-xs" @click="downloadFile(msg)" title="下载">
                    下载
                  </button>
                </div>
              </div>

              <div v-else-if="msg.kind === 'video'" class="flex flex-col gap-2">
                <video controls class="max-w-[240px] rounded-lg border border-base-content/20">
                  <source :src="getDownloadUrl(msg)" />
                </video>
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs opacity-70">{{ (msg.content as FileContent).filename }}</span>
                  <button class="btn btn-ghost btn-xs" @click="downloadFile(msg)" title="下载">
                    下载
                  </button>
                </div>
              </div>

              <!-- File Message -->
              <a v-else
                class="flex items-center gap-3 hover:bg-base-content/10 p-2 rounded transition-colors no-underline text-base-content"
                :href="getDownloadUrl(msg)" target="_blank"
                :download="(msg.content as FileContent).filename || 'download'">
                <div class="p-2 bg-base-content/10 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
                    <path fill-rule="evenodd"
                      d="M12 2.25a.75.75 0 01.75.75v11.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3a.75.75 0 01.75-.75zm-9 13.5a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z"
                      clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="flex flex-col">
                  <span class="font-bold text-sm">{{ (msg.content as FileContent).filename || 'File' }}</span>
                  <span class="text-xs opacity-70">
                    {{ (msg.content as FileContent).type || 'application/octet-stream' }}
                  </span>
                  <span class="text-xs opacity-70">
                    {{ formatBytes((msg.content as FileContent).size) }}
                  </span>
                </div>
              </a>
            </div>
          </div>
        </div>

        <!-- Input Area -->
        <div class="p-4 border-t border-base-300 bg-base-100 flex gap-2 items-center">
          <button class="btn btn-circle btn-ghost text-base-content/70 hover:bg-base-200"
            @click="showLocalFileModal = true" title="Send Local File Path (Zero Copy)">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
              stroke="currentColor" class="w-6 h-6">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
          </button>
          <input type="file" ref="fileInput" class="hidden" @change="handleFileUpload" />
          <button class="btn btn-circle btn-ghost text-base-content/70 hover:bg-base-200" @click="fileInput?.click()"
            title="Send File">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
              stroke="currentColor" class="w-6 h-6">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
            </svg>
          </button>

          <input v-model="messageText" @keyup.enter="sendMessage" type="text" placeholder="Type a message..."
            class="input input-bordered flex-1 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50 bg-base-200/50" />

          <button class="btn btn-circle btn-primary transition-transform active:scale-95" @click="sendMessage"
            :disabled="!messageText.trim()">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
              stroke="currentColor" class="w-5 h-5 translate-x-0.5">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </template>
    </div>

    <!-- DaisyUI Modal -->
    <dialog class="modal" :class="{ 'modal-open': showLocalFileModal }">
      <div class="modal-box">
        <h3 class="font-bold text-lg">Send Local File</h3>
        <p class="py-4">Enter the absolute path to a file on the server:</p>
        <input type="text" v-model="localFilePath" placeholder="/path/to/file.ext" class="input input-bordered w-full"
          @keyup.enter="handleLocalFileRegistration" />
        <div class="modal-action">
          <button class="btn" @click="showLocalFileModal = false">Cancel</button>
          <button class="btn btn-primary" @click="handleLocalFileRegistration"
            :disabled="!localFilePath.trim()">Send</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button @click="showLocalFileModal = false">close</button>
      </form>
    </dialog>
  </div>
</template>
