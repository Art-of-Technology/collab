import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface SummaryCard {
  title: string;
  value: number;
  description: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  href?: string;
}

interface SummaryCardsProps {
  cards: SummaryCard[];
}

export default function SummaryCards({ cards }: SummaryCardsProps) {
  return (
    <div className="grid gap-4 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-6 sm:mb-8">
      {cards.map((card) => {
        const Icon = card.icon;
        const CardComponent = card.href ? (
          <Link href={card.href} className="block">
            <Card className="border border-border/40 bg-card/50 hover:bg-card/80 transition-colors cursor-pointer hover:border-border group">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <div className={`p-2 ${card.bgColor} rounded-lg group-hover:scale-110 transition-transform`}>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold">{card.value}</div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
              </CardContent>
            </Card>
          </Link>
        ) : (
          <Card className="border border-border/40 bg-card/50 hover:bg-card/80 transition-colors">
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

        return (
          <div key={card.title}>
            {CardComponent}
          </div>
        );
      })}
    </div>
  );
}

