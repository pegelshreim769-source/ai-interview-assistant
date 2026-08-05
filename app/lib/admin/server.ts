import "server-only";

import { getBetaRedisClient } from "../beta-access/redis-client";
import { readAdminConfig } from "./config";
import { RedisAdminStore } from "./redis-store";
import { AdminService } from "./service";

const globalForAdmin = globalThis as typeof globalThis & { adminService?: AdminService };

export function getAdminService() {
  if (!globalForAdmin.adminService) {
    globalForAdmin.adminService = new AdminService(
      new RedisAdminStore(getBetaRedisClient),
      readAdminConfig()
    );
  }
  return globalForAdmin.adminService;
}
