<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { apiData } from '../stores/data';

interface FileContent {
  id: string;
  filename: string;
  type: string;
}

interface ChatMessage {
  id: string;
  source_id: string;
  target_id: string;
  kind: 'text' | 'file' | 'image';
  content: string | FileContent;
  timestamp: number;
  isSelf: boolean;
}

const props = defineProps<{
  myId?: string;
}>();

const messages = ref<ChatMessage[]>([]);
const messageText = ref('');
const selectedPeerId = ref<string | null>(null);
const socket = ref<WebSocket | null>(null);
const isConnected = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

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

const connect = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/ws`;
  
  socket.value = new WebSocket(wsUrl);

  socket.value.onopen = () => {
    isConnected.value = true;
    console.log('WS Connected');
  };

  socket.value.onclose = () => {
    isConnected.value = false;
    console.log('WS Disconnected');
    // Reconnect after delay
    setTimeout(connect, 3000);
  };

  socket.value.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);

      // Filter system messages if any leak through
      if (['ping', 'pong', 'sync'].includes(msg.kind)) return;

      const chatMsg: ChatMessage = {
        id: msg.id,
        source_id: msg.source_id,
        target_id: msg.target_id || 'broadcast',
        kind: (msg.kind as 'text' | 'file' | 'image') || 'text',
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
    id: crypto.randomUUID(),
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
  if (!file || !selectedPeerId.value || !socket.value) return;

  try {
    // Upload file to object store
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
    const kind = file.type.startsWith('image/') ? 'image' : 'file';
    const fileContent: FileContent = {
      id: objectId,
      filename: file.name,
      type: file.type
    };

    const payload = {
      target: selectedPeerId.value,
      kind: kind,
      content: fileContent
    };

    socket.value.send(JSON.stringify(payload));

    // Optimistically add
    messages.value.push({
      id: crypto.randomUUID(),
      source_id: apiData.value?.peer_id || 'me',
      target_id: selectedPeerId.value!,
      kind: kind,
      content: fileContent,
      timestamp: Date.now(),
      isSelf: true
    });
  } catch (e) {
    console.error('File upload error:', e);
    alert('Failed to upload file');
  }

  // Reset input
  if (fileInput.value) fileInput.value.value = '';
};

onMounted(() => {
  connect();
});

onUnmounted(() => {
  if (socket.value) socket.value.close();
});

// Auto-scroll to bottom
watch(currentMessages, () => {
  setTimeout(() => {
    const el = document.getElementById('chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }, 50);
}, { deep: true });

const formatTime = (ts: number) => new Date(ts).toLocaleTimeString();

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
  return `/api/object/${content.id}?peer=${msg.source_id}`;
};
</script>

<template>
  <div class="card bg-base-100 shadow-xl h-[calc(100vh-12rem)] md:h-[600px] flex flex-row overflow-hidden relative">
    <!-- Sidebar: Peer List -->
    <div 
      class="w-full md:w-80 border-r border-base-300 flex flex-col bg-base-200 transition-all duration-300 absolute md:relative z-10 h-full"
      :class="{ '-translate-x-full md:translate-x-0': selectedPeerId }"
    >
      <div class="p-4 font-bold flex justify-between items-center bg-base-200 sticky top-0 z-10">
        <span class="text-lg">Peers</span>
        <div class="badge badge-sm" :class="isConnected ? 'badge-success' : 'badge-error'">
          {{ isConnected ? 'Online' : 'Offline' }}
        </div>
      </div>
      <div class="overflow-y-auto flex-1 px-2 pb-2">
        <ul class="menu w-full p-0 gap-1">
          <li v-for="peer in peers" :key="peer.id">
            <a 
              @click="selectedPeerId = peer.id"
              :class="{ 'active': selectedPeerId === peer.id }"
              class="flex items-center gap-3 py-3 px-4 rounded-btn transition-all duration-200"
            >
              <div class="w-10 h-10 rounded-full bg-base-300 flex items-center justify-center shadow-sm" :class="{ 'ring-2 ring-primary ring-offset-2': selectedPeerId === peer.id }">
                <svg v-if="peer.id === 'broadcast'" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 018.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.43.816 1.035.816 1.73 0 .695-.321 1.3-.816 1.73m0-3.46a24.347 24.347 0 010 3.46" />
                </svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
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
          class="p-3 border-b border-base-300 bg-base-100/95 backdrop-blur flex justify-between items-center shadow-sm z-10 sticky top-0">
          <div class="font-bold flex items-center gap-3">
            <!-- Mobile Sidebar Toggle -->
            <button class="btn btn-circle btn-ghost btn-sm md:hidden -ml-2 mr-1" @click="selectedPeerId = null">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
            </button>

            <div class="w-10 h-10 rounded-full bg-base-300 flex items-center justify-center shadow-md">
              <svg v-if="selectedPeerId === 'broadcast'" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 018.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.43.816 1.035.816 1.73 0 .695-.321 1.3-.816 1.73m0-3.46a24.347 24.347 0 010 3.46" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
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
              <div class="w-8 h-8 rounded-full bg-base-300 flex items-center justify-center shadow-sm opacity-70">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
            </div>

            <div class="chat-header text-xs opacity-50 mb-1 flex items-center gap-2">
              <span class="font-bold">{{ msg.isSelf ? 'You' : msg.source_id.substring(0, 8) }}</span>
              <time class="text-[10px]">{{ formatTime(msg.timestamp) }}</time>
            </div>

            <div class="chat-bubble shadow-md" :class="msg.isSelf ? 'chat-bubble-primary' : 'chat-bubble-secondary'">
              <!-- Text Message -->
              <span v-if="msg.kind === 'text'" class="whitespace-pre-wrap">{{ msg.content }}</span>

              <!-- Image Message -->
              <div v-else-if="msg.kind === 'image'" class="flex flex-col gap-2">
                <img :src="getDownloadUrl(msg)" class="max-w-[200px] rounded-lg border border-base-content/20" />
                <span class="text-xs opacity-70">{{ (msg.content as FileContent).filename }}</span>
              </div>

              <!-- File Message -->
              <div v-else
                class="flex items-center gap-3 cursor-pointer hover:bg-base-content/10 p-2 rounded transition-colors"
                @click="downloadFile(msg)">
                <div class="p-2 bg-base-content/10 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                    stroke="currentColor" class="w-6 h-6">
                    <path stroke-linecap="round" stroke-linejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <div class="flex flex-col">
                  <span class="font-bold text-sm">{{ (msg.content as FileContent).filename || 'File' }}</span>
                  <span class="text-xs opacity-70">{{ (msg.content as FileContent).type || 'application/octet-stream'
                  }}</span>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                  stroke="currentColor" class="w-4 h-4 ml-2 opacity-50">
                  <path stroke-linecap="round" stroke-linejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12v8.25m0 0l-3.75-3.75M12 20.25l3.75-3.75M12 3v9" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <!-- Input Area -->
        <div class="p-4 border-t border-base-300 bg-base-100 flex gap-2 items-center">
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

          <button class="btn btn-circle btn-primary shadow-md transition-transform active:scale-95" @click="sendMessage"
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
  </div>
</template>
