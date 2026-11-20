import { WorkerUpdateScreen } from "@/components/WorkerUpdateScreen";

interface Props { installedBuild: number; minBuild: number | null; storeUrl?: string }

const ForceUpdateScreen = (_props: Props) => <WorkerUpdateScreen mandatory />;

export default ForceUpdateScreen;
