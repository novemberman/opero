export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export abstract class EmailPort {
  abstract send(message: EmailMessage): Promise<void>;
}
