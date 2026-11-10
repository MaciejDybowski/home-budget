import {
  createRouter,
  createWebHistory,
  createWebHashHistory,
} from "vue-router";

export default createRouter({
  history:
    import.meta.env.VITE_DEMO_MODE === "true"
      ? createWebHashHistory(import.meta.env.BASE_URL)
      : createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: (_to, _from, savedPosition) => savedPosition || { top: 0 },
  routes: [
    {
      path: "/",
      component: () => import("@/household/HomePage.vue"),
      meta: { title: "Nasz miesiąc" },
    },
    {
      path: "/transactions",
      component: () => import("@/household/TransactionsPage.vue"),
      meta: { title: "Transakcje" },
    },
    {
      path: "/budget",
      component: () => import("@/household/BudgetPage.vue"),
      meta: { title: "Budżet i cele" },
    },
    {
      path: "/analytics",
      component: () => import("@/household/AnalyticsPage.vue"),
      meta: { title: "Analizy" },
    },
    {
      path: "/recurring",
      component: () => import("@/household/RecurringPage.vue"),
      meta: { title: "Subskrypcje i stałe opłaty" },
    },
    {
      path: "/meters",
      component: () => import("@/household/MetersPage.vue"),
      meta: { title: "Liczniki" },
    },
    {
      path: "/more",
      component: () => import("@/household/MorePage.vue"),
      meta: { title: "Ustawienia" },
    },
    {
      path: "/profile",
      component: () => import("@/household/ProfilePage.vue"),
      meta: { title: "Profil" },
    },
    {
      path: "/import",
      component:
        import.meta.env.VITE_DEMO_MODE === "true"
          ? () => import("@/household/demo/DemoImportPage.vue")
          : () => import("@/household/ImportPage.vue"),
      meta: { title: "Import CSV" },
    },
    { path: "/expenses-dashboard", redirect: "/" },
    { path: "/expenses", redirect: "/transactions" },
    { path: "/incomes-dashboard", redirect: "/" },
    { path: "/incomes", redirect: "/transactions?tab=incomes" },
    { path: "/batch-expenses", redirect: "/import" },
    { path: "/categories", redirect: "/more" },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
