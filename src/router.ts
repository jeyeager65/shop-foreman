import { type RouteLocation, createRouter, createWebHashHistory } from 'vue-router';

export const routes = [
  { path: '/', name: 'projects', component: () => import('./views/ProjectsView.vue') },
  // A new project: what is being made, then (`?starter=<id>`) in what style.
  { path: '/new', name: 'new', component: () => import('./views/NewProjectView.vue') },
  { path: '/setup', name: 'setup', component: () => import('./views/SetupView.vue') },
  // The measurements of a cabinet that is already there, a picture for each: `?cabinet=2` the second.
  { path: '/measure', name: 'measure', component: () => import('./views/MeasureView.vue') },
  { path: '/design', name: 'design', component: () => import('./views/DesignView.vue') },
  { path: '/design/hinge', name: 'hinge', component: () => import('./views/HingePickerView.vue') },
  { path: '/design/slide', name: 'slide', component: () => import('./views/SlidePickerView.vue') },
  { path: '/plan', name: 'plan', component: () => import('./views/PlanView.vue') },
  { path: '/cut', name: 'cut', component: () => import('./views/MakeView.vue'), props: { screen: 'cut' } },
  { path: '/build', name: 'build', component: () => import('./views/MakeView.vue'), props: { screen: 'build' } },
  // Make became Cut and Build (milestone 5): its links open where their tab went.
  { path: '/make', redirect: (to: RouteLocation) => ({ path: to.query.kit === 'cabinet' ? '/build' : '/cut', query: to.query }) },
  { path: '/shop', name: 'shop', component: () => import('./views/ShopProfileView.vue') },
  // Jigs and handles, to print or cut with no project: `?item=<id>` opens one.
  { path: '/jigs', name: 'jigs', component: () => import('./views/JigsView.vue') },
  // Dev aid: every ?sample= project as a link.
  { path: '/samples', name: 'samples', component: () => import('./views/SamplesView.vue') },
];

export const createAppRouter = () => createRouter({ history: createWebHashHistory(), routes });
