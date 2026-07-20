export type ExpertReference = {
  title: string;
  url: string;
};

export type ExpertAnswerResult = {
  title: string;
  answer: string;
  keyPoints: string[];
  references: ExpertReference[];
  shortsTopics: import("./shorts").ShortsTopic[];
  disclaimer: string;
};
