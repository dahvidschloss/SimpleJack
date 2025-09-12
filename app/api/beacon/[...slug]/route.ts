import { type NextRequest } from "next/server"
import { handleBeaconGet, handleBeaconPost } from "@/lib/beacon"

export async function GET(request: NextRequest) {
  return handleBeaconGet(request)
}

export async function POST(request: NextRequest) {
  return handleBeaconPost(request)
}

export const dynamic = "force-dynamic"

