import React, { useState } from 'react';
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

  const handleSubmit = () => {
    if (selectedOption) {
      onSubmitAnswer(quizId, selectedOption);
    }
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
            label={`${String.fromCharCode(65 + index)}. ${option}`}
            buttonStyle={selectedOption === String.fromCharCode(65 + index) ? 'action' : 'regular'}
            onClick={() => setSelectedOption(String.fromCharCode(65 + index))}
          />
        ))}
      </div>
      <div className="quiz-actions">
        <Button
          label="Submit Answer"
          buttonStyle="action"
          onClick={handleSubmit}
          disabled={!selectedOption}
        />
      </div>
      {feedback && (
        <div className="quiz-feedback">
          <p>{feedback}</p>
        </div>
      )}
    </div>
  );
};