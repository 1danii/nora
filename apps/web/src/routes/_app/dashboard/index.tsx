import { createFileRoute } from "@tanstack/react-router";

import { IbkrDashboard } from "@/components/ibkr-dashboard";

/** The IBKR testing page. */
const Dashboard = () => {
  const { session } = Route.useRouteContext();
  return <IbkrDashboard username={session.username} demo={session.demo} />;
};

export const Route = createFileRoute("/_app/dashboard/")({
  head: () => ({ meta: [{ title: "Dashboard · Nora" }] }),
  component: Dashboard,
});
