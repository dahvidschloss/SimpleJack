import { type NextRequest } from "next/server"
import { handleBeaconGet } from "@/lib/beacon"

export async function GET(request: NextRequest) {
  return handleBeaconGet(request)
}
