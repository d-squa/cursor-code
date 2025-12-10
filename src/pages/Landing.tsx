import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { 
  Target, 
  TrendingUp, 
  Zap, 
  CheckCircle2, 
  ArrowRight, 
  BarChart3, 
  Users, 
  Clock,
  Shield,
  Layers,
  Globe,
  Sparkles,
  ChevronDown
} from "lucide-react";
import { toast } from "sonner";

const capabilities = [
  {
    icon: Target,
    title: "Guided Media Plan Creation",
    description: "Build comprehensive media plans with step-by-step guidance that ensures no detail is missed."
  },
  {
    icon: Sparkles,
    title: "AI-Powered Plan Generation",
    description: "Create base plans from high-level text prompts using advanced AI that understands your marketing goals."
  },
  {
    icon: Layers,
    title: "Excel & Sheets Import",
    description: "Seamlessly import existing media plans from Microsoft Excel or Google Sheets."
  },
  {
    icon: BarChart3,
    title: "Media Cost & Benchmarks",
    description: "Get accurate cost estimates and industry benchmarks for informed decision-making."
  },
  {
    icon: TrendingUp,
    title: "Performance Reports",
    description: "Track actual vs planned performance with comprehensive topline reports."
  },
  {
    icon: Globe,
    title: "Cross-Platform Activation",
    description: "Launch campaigns across Meta, Google, TikTok, LinkedIn, Snapchat & Pinterest simultaneously."
  },
  {
    icon: Zap,
    title: "Live Insights & Recommendations",
    description: "Real-time campaign insights with AI-powered optimization recommendations."
  },
  {
    icon: Shield,
    title: "Approval Workflows",
    description: "Enterprise-grade approval processes for campaign launches and modifications."
  }
];

const pricingTiers = [
  {
    name: "Trial",
    price: "Free",
    period: "30 days",
    description: "Perfect for exploring ActiPlan capabilities",
    features: [
      "1 ActiPlan/Day",
      "1 Owner",
      "Guided Media Plan Creation",
      "AI-Powered Plan Generation",
      "Excel & Sheets Import",
      "Topline Performance Report",
      "Cross-Platform Activation"
    ],
    limitations: ["No Visual Dashboard", "No Team Features"],
    cta: "Start Free Trial",
    popular: false,
    note: "Credit card required. No auto-renew."
  },
  {
    name: "Basic",
    price: "$49",
    period: "/month",
    description: "For individual media buyers getting started",
    features: [
      "1 ActiPlan/Day",
      "1 Owner",
      "All Trial Features",
      "Live Insights & Recommendations"
    ],
    limitations: ["No Visual Dashboard", "No Team Features"],
    cta: "Get Started",
    popular: false
  },
  {
    name: "Freelancer",
    price: "$99",
    period: "/month",
    description: "For professional media planners",
    features: [
      "2 ActiPlans/Day",
      "1 Owner",
      "Visual Performance Dashboard",
      "AI Campaign Commands",
      "All Basic Features"
    ],
    limitations: ["No Team Features"],
    cta: "Get Started",
    popular: true
  },
  {
    name: "Enterprise",
    price: "$345",
    period: "/month",
    description: "For teams and growing agencies",
    features: [
      "5 ActiPlans/Day",
      "1 Owner + 4 Team Members",
      "Approval Workflow",
      "Task Management & Log History",
      "HawkView Performance Report",
      "AI Knowledge Base",
      "User Permissions",
      "All Freelancer Features"
    ],
    limitations: [],
    cta: "Get Started",
    popular: false
  },
  {
    name: "Agency",
    price: "Custom",
    period: "",
    description: "For large agencies with dedicated support",
    features: [
      "Unlimited ActiPlans",
      "1 Owner, 1 Admin & 8 Team Members",
      "Dedicated Account Manager",
      "Working Hours Support",
      "All Enterprise Features"
    ],
    limitations: [],
    cta: "Contact Sales",
    popular: false
  }
];

const advantages = [
  {
    title: "Reduce Operational Costs by 40%",
    description: "Eliminate manual work and human errors with automated campaign creation and management."
  },
  {
    title: "Scale Without Hiring",
    description: "Handle 3x more campaigns with the same team using intelligent automation."
  },
  {
    title: "Launch Campaigns 5x Faster",
    description: "From media plan to live campaign in minutes, not hours."
  },
  {
    title: "Zero Learning Curve",
    description: "Intuitive interface designed for media buyers, by media buyers."
  }
];

const Landing = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    fullName: "",
    company: "",
    source: "",
    role: "",
    teamSize: "",
    experience: "",
    acceptTerms: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.acceptTerms) {
      toast.error("Please accept the terms and conditions");
      return;
    }
    setIsSubmitting(true);
    
    // Store survey data in localStorage for now, can be sent to backend later
    localStorage.setItem("actiplan_survey", JSON.stringify(formData));
    
    toast.success("Welcome to ActiPlan! Redirecting to sign up...");
    setTimeout(() => {
      navigate("/auth?mode=signup&email=" + encodeURIComponent(formData.email));
    }, 1000);
    
    setIsSubmitting(false);
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* SEO Meta - handled in index.html */}
      
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Target className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">ActiPlan</span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <button onClick={() => scrollToSection("capabilities")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Capabilities
            </button>
            <button onClick={() => scrollToSection("pricing")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </button>
            <button onClick={() => scrollToSection("signup")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Get Started
            </button>
          </div>
          <Button onClick={() => navigate("/auth")} variant="outline">
            Sign In
          </Button>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-4xl mx-auto text-center">
          <Badge variant="secondary" className="mb-6">
            <Sparkles className="h-3 w-3 mr-1" />
            AI-Powered Campaign Management
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Launch Cross-Platform{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Campaigns in Minutes
            </span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            ActiPlan transforms your media planning workflow. Create, optimize, and launch paid advertising 
            campaigns across Meta, Google, TikTok, LinkedIn, Snapchat, and Pinterest from a single interface.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => scrollToSection("signup")} className="gap-2">
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => scrollToSection("capabilities")}>
              See Capabilities
            </Button>
          </div>
        </div>
        
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-20 max-w-4xl mx-auto">
          {[
            { value: "40%", label: "Cost Reduction" },
            { value: "5x", label: "Faster Launches" },
            { value: "6+", label: "Platforms" },
            { value: "99.9%", label: "Uptime" }
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-primary">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities Section */}
      <section id="capabilities" className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything You Need to Scale Your Media Operations
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From planning to execution, ActiPlan streamlines every step of your campaign workflow.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {capabilities.map((cap) => (
              <Card key={cap.title} className="bg-card hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <cap.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{cap.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{cap.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Advantages Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Why Choose ActiPlan?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Join leading agencies and brands who have transformed their media operations.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {advantages.map((adv, idx) => (
              <div key={idx} className="flex gap-4 p-6 rounded-lg border bg-card">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg mb-2">{adv.title}</h3>
                  <p className="text-muted-foreground">{adv.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Choose the plan that fits your needs. Save 15% with yearly billing.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-6 max-w-7xl mx-auto">
            {pricingTiers.map((tier) => (
              <Card 
                key={tier.name} 
                className={`relative ${tier.popular ? "border-primary shadow-lg scale-105" : ""}`}
              >
                {tier.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                    Most Popular
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle>{tier.name}</CardTitle>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{tier.price}</span>
                    <span className="text-muted-foreground">{tier.period}</span>
                  </div>
                  <CardDescription>{tier.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 mb-6">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                    {tier.limitations.map((limit) => (
                      <li key={limit} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="h-4 w-4 flex-shrink-0" />
                        <span>{limit}</span>
                      </li>
                    ))}
                  </ul>
                  {tier.note && (
                    <p className="text-xs text-muted-foreground mb-4">{tier.note}</p>
                  )}
                  <Button 
                    className="w-full" 
                    variant={tier.popular ? "default" : "outline"}
                    onClick={() => scrollToSection("signup")}
                  >
                    {tier.cta}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <p className="text-center text-sm text-muted-foreground mt-8">
            All plans available for individuals and corporates. Corporate clients (5+ users) receive additional benefits.
          </p>
        </div>
      </section>

      {/* Survey & Signup Section */}
      <section id="signup" className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Start Your 30-Day Free Trial</CardTitle>
                <CardDescription>
                  Tell us a bit about yourself so we can personalize your experience
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full Name *</Label>
                      <Input
                        id="fullName"
                        required
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        placeholder="John Doe"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Work Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="john@company.com"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="company">Company / Organization</Label>
                    <Input
                      id="company"
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      placeholder="Your company name"
                    />
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="source">How did you hear about us? *</Label>
                      <Select
                        required
                        value={formData.source}
                        onValueChange={(value) => setFormData({ ...formData, source: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="google">Google Search</SelectItem>
                          <SelectItem value="linkedin">LinkedIn</SelectItem>
                          <SelectItem value="referral">Referral / Word of Mouth</SelectItem>
                          <SelectItem value="social">Social Media</SelectItem>
                          <SelectItem value="event">Event / Conference</SelectItem>
                          <SelectItem value="blog">Blog / Article</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="role">Your Role *</Label>
                      <Select
                        required
                        value={formData.role}
                        onValueChange={(value) => setFormData({ ...formData, role: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select your role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="media-buyer">Media Buyer</SelectItem>
                          <SelectItem value="media-planner">Media Planner</SelectItem>
                          <SelectItem value="account-manager">Account Manager</SelectItem>
                          <SelectItem value="marketing-manager">Marketing Manager</SelectItem>
                          <SelectItem value="agency-owner">Agency Owner</SelectItem>
                          <SelectItem value="freelancer">Freelancer</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="teamSize">Team Size *</Label>
                      <Select
                        required
                        value={formData.teamSize}
                        onValueChange={(value) => setFormData({ ...formData, teamSize: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select team size" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="solo">Just me</SelectItem>
                          <SelectItem value="2-5">2-5 people</SelectItem>
                          <SelectItem value="6-10">6-10 people</SelectItem>
                          <SelectItem value="11-25">11-25 people</SelectItem>
                          <SelectItem value="26-50">26-50 people</SelectItem>
                          <SelectItem value="50+">50+ people</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="experience">Paid Media Experience *</Label>
                      <Select
                        required
                        value={formData.experience}
                        onValueChange={(value) => setFormData({ ...formData, experience: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select experience" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="beginner">Beginner (less than 1 year)</SelectItem>
                          <SelectItem value="intermediate">Intermediate (1-3 years)</SelectItem>
                          <SelectItem value="advanced">Advanced (3-5 years)</SelectItem>
                          <SelectItem value="expert">Expert (5+ years)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="terms"
                      checked={formData.acceptTerms}
                      onCheckedChange={(checked) => setFormData({ ...formData, acceptTerms: checked as boolean })}
                    />
                    <Label htmlFor="terms" className="text-sm text-muted-foreground leading-relaxed">
                      I agree to the Terms of Service and Privacy Policy. I understand this is a 30-day trial 
                      that requires a credit card and does not auto-renew.
                    </Label>
                  </div>
                  
                  <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? "Processing..." : "Start Free Trial"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Target className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">ActiPlan</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} ActiPlan. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
