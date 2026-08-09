export interface PaymentService {
  list(projectId: string): Promise<ServicePayment[]>;
  listAdmin(projectId: string): Promise<ServicePayment[]>;
  record(input: LicenseBillingInput): Promise<ServicePayment>;
  updateStatus(
    paymentId: string,
    status: ServicePayment["status"],
    notes?: string,
  ): Promise<ServicePayment>;
  update(input: UpdatePaymentInput): Promise<ServicePayment>;
  remove(paymentId: string, reason: string): Promise<void>;
  void(paymentId: string, reason: string): Promise<void>;
  previewCharge(
    licenseId: string,
    plan: string,
    applicationRule: ChargePlanInput["applicationRule"],
  ): Promise<BillingPreview>;
  chargeAndAssign(input: ChargePlanInput): Promise<BillingReceipt>;
  receipt(paymentId: string): Promise<BillingReceipt>;
  repairReceipt(paymentId: string): Promise<BillingReceipt>;
}