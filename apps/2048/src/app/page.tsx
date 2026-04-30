import { ModeChooser } from "@skillbase/ui";

export default function HomePage() {
  return (
    <ModeChooser
      gameName="2048"
      tile={
        <img
          src="/2048.svg"
          alt=""
          aria-hidden
          className="h-5 w-5"
          style={{ imageRendering: "pixelated" }}
        />
      }
    />
  );
}
