import { ModeChooser } from "@skillbase/ui";

export default function HomePage() {
  return (
    <ModeChooser
      gameName="Clicker"
      tile={
        <img
          src="/clicker.svg"
          alt=""
          aria-hidden
          className="h-5 w-5"
          style={{ imageRendering: "pixelated" }}
        />
      }
    />
  );
}
