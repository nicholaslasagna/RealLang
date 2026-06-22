import type { ProviderStatus } from "../bridge";
import { PRIVATE_LOCAL_IMAGE_MODEL_PROFILE, trustLevelLabel } from "../providers";
import { Badge, Icon } from "./primitives";

interface PrivateImageProviderCardProps {
  status: ProviderStatus | null;
  desktop: boolean;
}

function providerKindLabel(value: string | null | undefined): string {
  return value === "local_image_provider" ? "Local image provider" : "Not configured";
}

export function PrivateImageProviderCard({ status, desktop }: PrivateImageProviderCardProps) {
  const profile = PRIVATE_LOCAL_IMAGE_MODEL_PROFILE;
  const configured = Boolean(status?.image_provider_configured);

  return (
    <section
      className="provider-settings-section private-image-provider"
      data-testid="private-local-image-model-panel"
      aria-labelledby="image-provider-config-title"
    >
      <header className="provider-settings-section__heading">
        <div className="provider-section-title">
          <span><Icon name="image" /></span>
          <div>
            <p className="eyebrow">IMAGE PROVIDER</p>
            <h2 id="image-provider-config-title">Private Local Image Model</h2>
            <p>Optional metadata only. Workbench cannot generate images in this milestone.</p>
          </div>
        </div>
        <div className="provider-chip-row">
          <Badge label={configured ? "METADATA DETECTED" : desktop ? "NOT CONFIGURED" : "DESKTOP ONLY"} tone={configured ? "cyan" : "amber"} />
          <Badge label="EXECUTION OFF" tone="amber" />
          <Badge label={trustLevelLabel(profile.trustLevel)} tone="amber" />
        </div>
      </header>

      {!configured ? (
        <div className="provider-console-state provider-console-state--quiet">
          <Icon name="image" />
          <span>
            <b>No executable image provider</b>
            <small>Metadata may be configured locally later; binary generation and provider execution remain unavailable.</small>
          </span>
        </div>
      ) : null}

      <dl className="provider-status-summary__grid provider-status-summary__grid--image">
        <div><dt>Metadata configured</dt><dd>{configured ? "YES" : "NO"}</dd></div>
        <div><dt>Provider kind</dt><dd>{providerKindLabel(status?.image_provider_kind)}</dd></div>
        <div><dt>Local endpoint</dt><dd>{status?.image_endpoint_host ?? "NOT CONFIGURED"}</dd></div>
        <div><dt>Image execution</dt><dd>DISABLED</dd></div>
        <div><dt>Image generation</dt><dd>OFF</dd></div>
        <div><dt>Output trust</dt><dd>LOCAL UNTRUSTED</dd></div>
      </dl>
    </section>
  );
}
