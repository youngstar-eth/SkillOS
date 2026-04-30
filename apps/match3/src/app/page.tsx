import { ModeChooser } from "@skillbase/ui";

export default function HomePage() {
  return (
    <ModeChooser
      gameName="Match 3"
      tile={
        <img
          src="/match3.svg"
          alt=""
          aria-hidden
          className="h-5 w-5"
          style={{ imageRendering: "pixelated" }}
        />
      }
    />
  );
}
