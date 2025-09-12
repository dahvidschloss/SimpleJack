import { type NextRequest } from "next/server"
import { handleBeaconPost } from "@/lib/beacon"

export async function POST(request: NextRequest) {
  return handleBeaconPost(request)
}
