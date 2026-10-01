export type ServiceAction = 'register' | 'unregister' | 'status' | 'approvalSettings';

export interface RegistrationResult {
  status: string;
  registration?: string;
}

/** Registration state is independent of the worker's authenticated connection/PID. */
export interface ServiceRegistration {
  run(action: ServiceAction): Promise<RegistrationResult>;
}
