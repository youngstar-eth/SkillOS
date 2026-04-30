import { ModeChooser } from "@skillbase/ui";

export default function HomePage() {
  return (
    <ModeChooser
      gameName="Sudoku"
      tile={
        <img
          src="/sudoku.svg"
          alt=""
          aria-hidden
          className="h-5 w-5"
          style={{ imageRendering: "pixelated" }}
        />
      }
    />
  );
}
