import { brandNameDisplay } from "@repo/seo/branding";
import { ImageResponse } from "next/og";

export const alt = "Team Calendar practical guides";
export const size = { height: 630, width: 1200 };
export const contentType = "image/png";

const OpenGraphImage = () =>
  new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: "#edf2eb",
        color: "#1d211d",
        display: "flex",
        flexDirection: "column",
        fontFamily: "sans-serif",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px 84px",
        width: "100%",
      }}
    >
      <div
        style={{
          color: "#336a3b",
          display: "flex",
          fontSize: 30,
          fontWeight: 700,
        }}
      >
        {brandNameDisplay}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.05,
            maxWidth: 900,
          }}
        >
          Practical leave and calendar guides
        </div>
        <div style={{ color: "#525b52", display: "flex", fontSize: 30 }}>
          Clear answers for teams using Xero Payroll and calendar feeds.
        </div>
      </div>
      <div
        style={{
          background: "#336a3b",
          borderRadius: 16,
          display: "flex",
          height: 18,
          width: 164,
        }}
      />
    </div>,
    size
  );

export default OpenGraphImage;
