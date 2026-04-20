import { handleSdkConfigRequest } from '@/lib/server/sdk-config-resolver'

export async function GET(request: Request) {
  return handleSdkConfigRequest(request)
}
