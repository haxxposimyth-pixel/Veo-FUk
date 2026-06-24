export class StructuredOutputError extends Error {
  public readonly agentName: string;
  public readonly attemptCount: number;
  public readonly zodIssues: any[];
  public readonly rawOutput: string;

  constructor(params: {
    agentName: string;
    attemptCount: number;
    zodIssues: any[];
    rawOutput: string;
    message: string;
  }) {
    super(params.message);
    this.name = 'StructuredOutputError';
    this.agentName = params.agentName;
    this.attemptCount = params.attemptCount;
    this.zodIssues = params.zodIssues;
    this.rawOutput = params.rawOutput;
    
    // Set the prototype explicitly (required in ES5/TS environment for custom errors)
    Object.setPrototypeOf(this, StructuredOutputError.prototype);
  }
}
