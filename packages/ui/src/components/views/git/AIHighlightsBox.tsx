import React from 'react';
import {RiArrowDownLine} from '@remixicon/react';
import {Button} from '@/components/ui/button';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import {useI18n} from '@/contexts/useI18n';

interface AIHighlightsBoxProps {
  highlights: string[];
  onInsert: () => void;
  onClear: () => void;
}

export const AIHighlightsBox: React.FC<AIHighlightsBoxProps> = ({
  highlights,
  onInsert,
  onClear,
}) => {
    const {t} = useI18n();
  if (highlights.length === 0) {
    return null;
  }

  const handleInsert = () => {
    onInsert();
    onClear();
  };

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-transparent px-3 py-2">
      <div className="flex items-center justify-between gap-2">
          <p className="typography-micro text-muted-foreground">{t('AI highlights')}</p>
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={handleInsert}
              aria-label={t('Insert highlights into commit message')}
            >
              <RiArrowDownLine className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent sideOffset={8}>
              {t('Append highlights to commit message')}
          </TooltipContent>
        </Tooltip>
      </div>
      <ul className="space-y-1">
        {highlights.map((highlight, index) => (
          <li key={index} className="typography-meta text-foreground">
            {highlight}
          </li>
        ))}
      </ul>
    </div>
  );
};
