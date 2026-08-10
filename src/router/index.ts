import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import DisplayView from '../views/DisplayView.vue'
import WorkbenchView from '../views/WorkbenchView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/display',
      name: 'display',
      component: DisplayView
    },
    {
      path: '/workbench',
      name: 'workbench',
      component: WorkbenchView
    }
  ]
})

export default router
