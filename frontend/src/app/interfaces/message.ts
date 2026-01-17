export interface Message {
    text: string;
    createdAt: Date;
    userId: string;
    username?: string;
}