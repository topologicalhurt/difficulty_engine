import type {
  AiClarificationMessage,
  AiClarificationProviderResponse,
} from './types';

const AI_CLARIFICATION_TEXT_LIMIT = 1600;
const AI_CLARIFICATION_MESSAGE_LIMIT = 16;
const AI_CLARIFICATION_WARNING_LIMIT = 6;
const AI_CLARIFICATION_QUESTION_LIMIT = 6;

export interface NormalizedAiClarificationResponse {
  question: string | null;
  questions: string[];
  ready: boolean;
  refinedPrompt: string | null;
  warnings: string[];
}

export interface PendingAiClarificationQuestion {
  messageIndex: number;
  text: string;
}

function boundedText(value: unknown, limit = AI_CLARIFICATION_TEXT_LIMIT): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

export function normalizeAiClarificationAnswer(value: string): string {
  return boundedText(value);
}

export function normalizeAiClarificationMessages(
  messages: AiClarificationMessage[],
): AiClarificationMessage[] {
  return messages
    .map((message) => ({
      role: (message.role === 'assistant' ? 'assistant' : 'user') as
        | 'assistant'
        | 'user',
      text: boundedText(message.text),
    }))
    .filter((message) => message.text)
    .slice(-AI_CLARIFICATION_MESSAGE_LIMIT);
}

export function pendingAiClarificationQuestions(
  messages: AiClarificationMessage[],
): PendingAiClarificationQuestion[] {
  const lastUserIndex = messages.reduce(
    (latest, message, index) => (message.role === 'user' ? index : latest),
    -1,
  );
  return messages
    .map((message, index) => ({ message, index }))
    .filter(
      ({ message, index }) => index > lastUserIndex && message.role === 'assistant',
    )
    .map(({ message, index }) => ({ messageIndex: index, text: message.text }));
}

export function answeredClarificationMessage(
  questions: PendingAiClarificationQuestion[],
  answers: Record<string, string>,
): AiClarificationMessage | null {
  const lines = questions
    .map((question, index) => {
      const answer = normalizeAiClarificationAnswer(
        answers[String(question.messageIndex)] ?? '',
      );
      return answer
        ? `${index + 1}. ${question.text}\nAnswer: ${answer}`
        : '';
    })
    .filter(Boolean);
  return lines.length
    ? { role: 'user', text: lines.join('\n\n') }
    : null;
}

export function normalizeAiClarificationResponse(
  response: AiClarificationProviderResponse,
): NormalizedAiClarificationResponse {
  const singleQuestion = boundedText(response.question);
  const questions = (
    Array.isArray(response.questions)
      ? response.questions.map((question) => boundedText(question))
      : [singleQuestion]
  )
    .filter(Boolean)
    .slice(0, AI_CLARIFICATION_QUESTION_LIMIT);
  const question = questions[0] ?? null;
  const refinedPrompt = boundedText(response.refinedPrompt);
  const warnings = Array.isArray(response.warnings)
    ? response.warnings
        .map((warning) => boundedText(warning, 240))
        .filter(Boolean)
        .slice(0, AI_CLARIFICATION_WARNING_LIMIT)
    : [];
  return {
    question,
    questions,
    ready: response.ready === true || (!questions.length && Boolean(refinedPrompt)),
    refinedPrompt: refinedPrompt || null,
    warnings,
  };
}
