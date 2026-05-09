import { ImageResponse } from "next/og";
import { splashTemplate } from "@skillbase/ui";

export const runtime = "nodejs";

export async function GET() {
  return new ImageResponse(splashTemplate({ name: 'SkillOS Sudoku' }), {
    width: 512,
    height: 512,
  });
}
