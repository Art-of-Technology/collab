import { Suspense } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Home, ArrowLeft } from 'lucide-react';

function ErrorContent({ searchParams }: { searchParams: { message?: string } }) {
  const message = searchParams.message || 'An unexpected error occurred';

  return (
    <div className="container mx-auto px-4 py-16 max-w-2xl">
      <Card className="border-red-200">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <CardTitle className="text-2xl text-red-800">Something went wrong</CardTitle>
          <CardDescription className="text-red-600">
            We encountered an error while processing your request
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800 font-medium">Error Details:</p>
            <p className="text-sm text-red-700 mt-1">{message}</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="outline" asChild>
              <Link href="/" className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                Go Back
              </Link>
            </Button>
            <Button asChild>
              <Link href="/" className="flex items-center gap-2">
                <Home className="w-4 h-4" />
                Home
              </Link>
            </Button>
          </div>

          <div className="mt-8 text-sm text-muted-foreground">
            <p>If this problem persists, please contact support with the error details above.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ErrorPage({ 
  searchParams 
}: { 
  searchParams: { message?: string } 
}) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ErrorContent searchParams={searchParams} />
    </Suspense>
  );
}
