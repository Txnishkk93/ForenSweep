import { SectionHeading } from "@/components/Primitives";
import { EraseWizard } from "./EraseWizard";

export default function NewErasePage({
  searchParams,
}: {
  searchParams: { deviceId?: string };
}) {
  return (
    <div>
      <SectionHeading eyebrow="Secure erasure" title="Sanitize a device" />
      <EraseWizard initialDeviceId={searchParams.deviceId} />
    </div>
  );
}
