import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import ChatView from '../views/ChatView.vue'
import NetworkView from '../views/NetworkView.vue'
import ConnectionsView from '../views/ConnectionsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/chat/:peerId?',
      name: 'chat',
      component: ChatView
    },
    {
      path: '/network',
      name: 'network',
      component: NetworkView
    },
    {
      path: '/connections',
      name: 'connections',
      component: ConnectionsView
    }
  ]
})

export default router
