import { DashboardHeader } from "./dashboard-header";

export function ViewerView() {
  return (
    <div className="space-y-6">
      <DashboardHeader
        name="Welcome"
        roleLabel="Viewer"
        subtitle="Your account does not have a person profile in this organisation yet. Contact the organisation owner if this looks wrong."
        xeroConnected={false}
      />
    </div>
  );
}
