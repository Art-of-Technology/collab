/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		colors: {
  			green: {
  				'400': '#22c55e',
  				'500': '#22c55e',
  				'600': '#16a34a',
  				'700': '#15803d'
  			},
  			glass: {
  				DEFAULT: 'rgba(255,255,255,0.03)',
  				light: 'rgba(255,255,255,0.06)',
  				medium: 'rgba(255,255,255,0.08)',
  				heavy: 'rgba(255,255,255,0.12)',
  				border: 'rgba(255,255,255,0.08)',
  				'border-light': 'rgba(255,255,255,0.12)',
  			},
  			glow: {
  				purple: '#8b5cf6',
  				blue: '#3b82f6',
  				cyan: '#06b6d4',
  				emerald: '#10b981',
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		boxShadow: {
  			'glass': '0 8px 32px rgba(0,0,0,0.3)',
  			'glass-lg': '0 16px 48px rgba(0,0,0,0.4)',
  			'glow-purple': '0 0 20px rgba(139,92,246,0.15), 0 0 60px rgba(139,92,246,0.05)',
  			'glow-blue': '0 0 20px rgba(59,130,246,0.15), 0 0 60px rgba(59,130,246,0.05)',
  			'glow-sm-purple': '0 0 10px rgba(139,92,246,0.2)',
  			'glow-sm-blue': '0 0 10px rgba(59,130,246,0.2)',
  		},
  		keyframes: {
  			'accordion-down': {
  				from: { height: '0' },
  				to: { height: 'var(--radix-accordion-content-height)' }
  			},
  			'accordion-up': {
  				from: { height: 'var(--radix-accordion-content-height)' },
  				to: { height: '0' }
  			},
  			'collapsible-down': {
  				from: { height: '0' },
  				to: { height: 'var(--radix-collapsible-content-height)' }
  			},
  			'collapsible-up': {
  				from: { height: 'var(--radix-collapsible-content-height)' },
  				to: { height: '0' }
  			},
  			'float': {
  				'0%, 100%': { transform: 'translateY(0)' },
  				'50%': { transform: 'translateY(-6px)' }
  			},
  			'pulse-glow': {
  				'0%, 100%': { opacity: '0.4' },
  				'50%': { opacity: '0.8' }
  			},
  			'shimmer': {
  				'0%': { backgroundPosition: '-200% 0' },
  				'100%': { backgroundPosition: '200% 0' }
  			},
  			'breathe': {
  				'0%, 100%': { transform: 'scale(1)', opacity: '0.6' },
  				'50%': { transform: 'scale(1.05)', opacity: '1' }
  			},
  			'drift': {
  				'0%': { transform: 'translate(0,0) rotate(0deg)' },
  				'33%': { transform: 'translate(30px,-20px) rotate(120deg)' },
  				'66%': { transform: 'translate(-20px,15px) rotate(240deg)' },
  				'100%': { transform: 'translate(0,0) rotate(360deg)' }
  			},
  			'gradient-shift': {
  				'0%': { backgroundPosition: '0% 50%' },
  				'50%': { backgroundPosition: '100% 50%' },
  				'100%': { backgroundPosition: '0% 50%' }
  			},
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'collapsible-down': 'collapsible-down 0.2s ease-out',
  			'collapsible-up': 'collapsible-up 0.2s ease-out',
  			'float': 'float 6s ease-in-out infinite',
  			'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
  			'shimmer': 'shimmer 3s linear infinite',
  			'breathe': 'breathe 4s ease-in-out infinite',
  			'drift': 'drift 20s ease-in-out infinite',
  			'gradient-shift': 'gradient-shift 8s ease infinite',
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} 