import React from "react";
import { Card } from "@/components/ui/card";
import { SlashCommandsManager } from "../SlashCommandsManager";

export const CommandsSettings: React.FC = () => {
  return (
    <Card className="p-6">
      <SlashCommandsManager className="p-0" />
    </Card>
  );
};