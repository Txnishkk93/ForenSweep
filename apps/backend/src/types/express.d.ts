declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        userId: string;
        username: string;
        role: "ADMIN" | "OPERATOR" | "INVESTIGATOR";
      };
    }
  }
}

export {};
