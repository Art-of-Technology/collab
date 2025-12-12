import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface SummaryCard {
  title: string;
  value: number | string;
  description: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

interface WebhookSummaryCardsProps {
  cards: SummaryCard[];
}

export default function WebhookSummaryCards({ cards }: WebhookSummaryCardsProps) {
  return (
    <div className="grid gap-4 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-6 sm:mb-8">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title} className="border border-border/40 bg-card/50 hover:bg-card/80 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <div className={`p-2 ${card.bgColor} rounded-lg`}>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

