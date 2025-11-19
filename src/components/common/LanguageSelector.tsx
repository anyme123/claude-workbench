import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export const LanguageSelector: React.FC = () => {
  const { t, changeLanguage, getCurrentLanguage, getAvailableLanguages, getLanguageLabel } = useTranslation();

  const handleLanguageChange = (value: string) => {
    changeLanguage(value);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="language-select">{t('settings.language')}</Label>
      <Select value={getCurrentLanguage()} onValueChange={handleLanguageChange}>
        <SelectTrigger id="language-select">
          <SelectValue placeholder={t('settings.language')} />
        </SelectTrigger>
        <SelectContent>
          {getAvailableLanguages().map((lang) => (
            <SelectItem key={lang} value={lang}>
              {getLanguageLabel(lang)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default LanguageSelector;
