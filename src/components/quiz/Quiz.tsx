import React, { useState, useEffect } from 'react';
import { Button } from '../button/Button';
import './Quiz.scss';

interface QuizProps {
  question: string;
  options: string[];
  quizId: string;
  score: number;
  onSubmitAnswer: (quizId: string, selectedOption: string) => void;
  feedback: string;
}

export const Quiz: React.FC<QuizProps> = ({
  question,
  options,
  quizId,
  score,
  onSubmitAnswer,
  feedback,
}) => {
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isFeedbackVisible, setIsFeedbackVisible] = useState<boolean>(false);

  useEffect(() => {
    if (feedback) {
      setIsFeedbackVisible(true);
      setIsSubmitting(false);
    }
  }, [feedback]);

  const handleSubmit = () => {
    if (selectedOption && !isSubmitting) {
      onSubmitAnswer(quizId, selectedOption);
      setIsSubmitting(true);
    }
  };

  const resetQuiz = () => {
    setSelectedOption('');
    setIsFeedbackVisible(false);
  };

  return (
    <div data-component="Quiz">
      <div className="quiz-header">
        <h2>Quiz Time!</h2>
        <p>Score: {score}</p>
      </div>
      <div className="quiz-question">
        <p>{question}</p>
      </div>
      <div className="quiz-options">
        {options.map((option, index) => (
          <Button
            key={index}
            label={option}
            buttonStyle={selectedOption === option ? 'action' : 'regular'}
            onClick={() => setSelectedOption(option)}
          />
        ))}
      </div>
      <div className="quiz-actions">
        <Button
          label="Submit Answer"
          buttonStyle="action"
          onClick={handleSubmit}
          disabled={!selectedOption || isSubmitting}
        />
        {isFeedbackVisible && (
          <Button
            label="Next Question"
            buttonStyle="regular"
            onClick={resetQuiz}
            disabled={isSubmitting}
          />
        )}
      </div>
      {feedback && (
        <div className="quiz-feedback">
          <p>{feedback}</p>
        </div>
      )}
    </div>
  );
};