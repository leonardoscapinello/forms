import {
  Type, AlignLeft, List, CircleDot, Star, Mail, Hash, Calendar,
  Phone, MapPin, Globe, ChevronDown, ThumbsUp, Scale, BarChart3,
  Trophy, Upload, FileText, MonitorPlay, Flag, ExternalLink,
  Users, CheckSquare, Gavel, Webhook,
} from 'lucide-react';
import { QuestionType } from '@/types/form';
import { LucideIcon } from 'lucide-react';

export const QUESTION_TYPE_ICONS: Record<QuestionType, LucideIcon> = {
  contact_info: Users,
  email: Mail,
  phone: Phone,
  address: MapPin,
  website: Globe,
  short_text: Type,
  long_text: AlignLeft,
  multiple_choice: List,
  single_choice: CircleDot,
  dropdown: ChevronDown,
  yes_no: ThumbsUp,
  legal: Gavel,
  checkbox: CheckSquare,
  nps: BarChart3,
  opinion_scale: Scale,
  rating: Star,
  ranking: Trophy,
  number: Hash,
  date: Calendar,
  file_upload: Upload,
  statement: FileText,
  welcome_screen: MonitorPlay,
  end_screen: Flag,
  redirect_url: ExternalLink,
  webhook: Webhook,
};
