import {
  DEMO_USERS,
  EMPLOYEES,
  HISTORY,
  LICENSES,
  PAYMENTS,
  PROJECTS,
  visibleProjects,
} from "@/lib/mock-data";
import type { AdminServices } from "./types";

export const demoServices: AdminServices = {
  provider: "demo",
  projects: {
    async list(userId) {
      if (!userId) return PROJECTS;
      const user = DEMO_USERS.find((candidate) => candidate.id === userId);
      return user ? visibleProjects(user) : [];
    },
  },
  projectMembers: {
    async list(projectId) {
      return EMPLOYEES.filter((employee) => employee.projectIds.includes(projectId));
    },
  },
  licenses: {
    async list(projectId) {
      return LICENSES.filter((license) => license.projectId === projectId).map((license) => ({
        id: license.id,
        projectId: license.projectId,
        userId: license.clientId,
        key: license.key,
        status: license.status,
        activatedAt: license.activatedAt,
        expiresAt: license.expiresAt,
      }));
    },
  },
  payments: {
    async list(projectId) {
      return PAYMENTS.filter((payment) => payment.projectId === projectId).map((payment) => ({
        id: payment.id,
        projectId: payment.projectId,
        userId: payment.clientId,
        licenseId: payment.licenseId,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        reference: payment.reference,
        employeeId: payment.employeeId,
        createdAt: payment.createdAt,
      }));
    },
  },
  licenseAuditLog: {
    async list(projectId) {
      return HISTORY.filter((entry) => entry.projectId === projectId);
    },
  },
};
