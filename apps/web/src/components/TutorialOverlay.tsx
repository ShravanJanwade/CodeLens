import { useState, useEffect } from 'react';
import { X, ChevronRight, Check } from 'lucide-react';

const TUTORIAL_STEPS = [
  {
    title: 'Welcome to CodeLens / AegisOps',
    description:
      "CodeLens connects repository analysis with deterministic incident investigation. Let's take a quick tour of the working demo.",
  },
  {
    title: '1. Repository analysis',
    description:
      'On a local install, connect a public GitHub repository and start an analysis. The worker uses bounded static checks for JavaScript, TypeScript, Python, and Java; Ollama can add a local architectural summary.',
  },
  {
    title: '2. Inspect findings',
    description:
      'Open a repository to review the analysis run, its deterministic findings, risk hotspots, and the sampled architecture summary.',
  },
  {
    title: '3. Simulate an Outage',
    description:
      'Open the Demo page and choose a deterministic scenario. It emits reproducible telemetry through the API and creates a correlated incident.',
  },
  {
    title: '4. Watch the AI Agent',
    description:
      'Flip back to the Incidents tab. You will see an AI Agent automatically spin up. Watch the Agents tab to see exactly what logs it queries and how it deduces the root cause in real-time.',
  },
];

export default function TutorialOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Only show once per session
    if (!sessionStorage.getItem('tutorial_seen')) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    sessionStorage.setItem('tutorial_seen', 'true');
  };

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface border border-border w-[500px] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-border bg-surface-2">
          <div className="flex items-center gap-2">
            <span className="text-accent font-bold text-lg">AegisOps</span>
            <span className="badge bg-surface-3 text-text-secondary border border-border text-xs">
              Interactive Tour
            </span>
          </div>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-surface-3 rounded-md text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex gap-2 mb-6">
            {TUTORIAL_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i <= currentStep ? 'bg-accent' : 'bg-surface-3'}`}
              />
            ))}
          </div>

          <h2 className="text-xl font-bold text-text-primary mb-3">{TUTORIAL_STEPS[currentStep].title}</h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            {TUTORIAL_STEPS[currentStep].description}
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-surface-2 flex justify-between items-center">
          <button
            onClick={handleClose}
            className="text-xs text-text-muted hover:text-text-primary font-medium"
          >
            Skip Tutorial
          </button>
          <button onClick={handleNext} className="btn-primary text-sm flex items-center gap-1.5 px-4">
            {currentStep === TUTORIAL_STEPS.length - 1 ? (
              <>
                Get Started <Check className="w-4 h-4" />
              </>
            ) : (
              <>
                Next Step <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
