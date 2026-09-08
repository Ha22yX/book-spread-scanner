import { englishWordCount } from './reading-context';
export const MAX_ANNOTATION_WORDS = 10;
export function validAnnotationComment(comment: string) {
  const count = englishWordCount(comment);
  return count >= 1 && count <= MAX_ANNOTATION_WORDS && !/\p{Script=Han}/u.test(comment);
}
