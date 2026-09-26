import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wand2, Component, Blend, Clapperboard, SlidersHorizontal } from 'lucide-react';

// §68 creation UI — 4 creation modes, LD style select, motion level, Generate.
// §69 advanced options (all [Auto]) appear when CINEMATIC_UNIVERSE is chosen.
export type CreationMode = 'CUSTOM_AI' | 'COMPONENT_SYSTEM' | 'HYBRID' | 'CINEMATIC_UNIVERSE';
export type MotionLevel = 'MINIMAL' | 'BALANCED' | 'CINEMATIC' | 'IMMERSIVE';
export type AdvSetting = 'auto' | 'on' | 'off';

export type AdvancedOptions = {
  threeD: AdvSetting;
  shaders: AdvSetting;
  scrollStorytelling: AdvSetting;
  loopingScene: AdvSetting;
  parallax: AdvSetting;
  interactiveCursor: AdvSetting;
  pageTransitions: AdvSetting;
  deviceOptimization: AdvSetting;
  // §70: EXTREME is an explicit operator override — never automatic.
  motionIntensity: MotionLevel | 'EXTREME' | 'auto';
};

export type CreationOptions = {
  creationMode: CreationMode;
  styleId: string; // '' = auto-recommend
  motionIntensity: MotionLevel;
  advanced: AdvancedOptions;
};

export const CREATION_MODES: { id: CreationMode; label: string; note: string; icon: typeof Wand2 }[] = [
  { id: 'CUSTOM_AI', label: 'AI Custom Design', note: 'Full creative freedom, style-guided', icon: Wand2 },
  { id: 'COMPONENT_SYSTEM', label: 'Component System', note: 'Approved reusable components, consistent & fast', icon: Component },
  { id: 'HYBRID', label: 'Hybrid', note: 'Component base with custom-composed sections', icon: Blend },
  { id: 'CINEMATIC_UNIVERSE', label: 'Cinematic Universe', note: 'Scroll-driven scenes, shader-grade ambient motion', icon: Clapperboard },
];

export const MOTION_LEVELS: { id: MotionLevel; label: string }[] = [
  { id: 'MINIMAL', label: 'Minimal' },
  { id: 'BALANCED', label: 'Balanced' },
  { id: 'CINEMATIC', label: 'Cinematic' },
  { id: 'IMMERSIVE', label: 'Immersive' },
];

export const ADVANCED_FIELDS: { key: keyof AdvancedOptions; label: string }[] = [
  { key: 'threeD', label: '3D scenes' },
  { key: 'shaders', label: 'Shaders & gradients' },
  { key: 'scrollStorytelling', label: 'Scroll storytelling' },
  { key: 'loopingScene', label: 'Looping scene' },
  { key: 'parallax', label: 'Parallax' },
  { key: 'interactiveCursor', label: 'Interactive cursor' },
  { key: 'pageTransitions', label: 'Page transitions' },
  { key: 'deviceOptimization', label: 'Device optimization' },
  { key: 'motionIntensity', label: 'Motion intensity' },
];

export function defaultAdvanced(): AdvancedOptions {
  return {
    threeD: 'auto', shaders: 'auto', scrollStorytelling: 'auto', loopingScene: 'auto',
    parallax: 'auto', interactiveCursor: 'auto', pageTransitions: 'auto', deviceOptimization: 'auto',
    motionIntensity: 'auto',
  };
}

export function defaultCreationOptions(): CreationOptions {
  return { creationMode: 'CUSTOM_AI', styleId: '', motionIntensity: 'BALANCED', advanced: defaultAdvanced() };
}

// Body fields for POST /builder/project/:id/plan|build. Advanced options are
// only sent for CINEMATIC_UNIVERSE and only when overridden from [Auto].
export function buildCreationPayload(value: CreationOptions) {
  const payload: Record<string, unknown> = {
    creationMode: value.creationMode,
    styleId: value.styleId || undefined,
    motionIntensity: value.motionIntensity,
  };
  if (value.creationMode === 'CINEMATIC_UNIVERSE') {
    const advanced: Record<string, unknown> = {};
    for (const f of ADVANCED_FIELDS) {
      const v = value.advanced[f.key];
      if (v !== 'auto') advanced[f.key] = v;
    }
    if (Object.keys(advanced).length) payload.advanced = advanced;
  }
  return payload;
}

type StyleOption = { id: string; name: string; palette?: Record<string, string> };

export default function CreationModePicker({
  value, onChange, recommended = [], busy = false, disabled = false, generateLabel = 'Generate', onGenerate,
}: {
  value: CreationOptions;
  onChange: (v: CreationOptions) => void;
  recommended?: string[];
  busy?: boolean;
  disabled?: boolean;
  generateLabel?: string;
  onGenerate: () => void;
}) {
  const [styles, setStyles] = useState<StyleOption[]>([]);

  // LD style catalog comes from the component-library meta endpoint; until it
  // is available we degrade to the plan-recommended styles (same as before).
  useEffect(() => {
    api<{ styles?: (StyleOption | string)[] }>('/library/meta')
      .then((d) => {
        const list = (d.styles || []).map((s) => (typeof s === 'string' ? { id: s, name: s } : s)).filter((s) => s?.id);
        setStyles(list);
      })
      .catch(() => {});
  }, []);

  const merged: StyleOption[] = [
    ...recommended.map((id) => styles.find((s) => s.id === id) || { id, name: id }),
    ...styles.filter((s) => !recommended.includes(s.id)),
  ];

  const setAdvanced = (key: keyof AdvancedOptions, v: string) =>
    onChange({ ...value, advanced: { ...value.advanced, [key]: v } });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {CREATION_MODES.map((m) => {
          const active = value.creationMode === m.id;
          return (
            <button key={m.id} type="button" onClick={() => onChange({ ...value, creationMode: m.id })}
              className={`text-left rounded-xl border-2 p-3 transition-all ${active ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-border hover:border-muted-foreground/50'}`}>
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <m.icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                {m.label}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{m.note}</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground">LD style</label>
          <Select value={value.styleId || 'auto'} onValueChange={(v) => onChange({ ...value, styleId: v === 'auto' ? '' : v })}>
            <SelectTrigger className="w-60"><SelectValue placeholder="Auto-recommend" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-recommend</SelectItem>
              {merged.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    {s.palette?.accent && <span className="inline-block h-3 w-3 rounded-sm border" style={{ background: s.palette.accent }} />}
                    {s.id} {s.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Motion level</label>
          <Select value={value.motionIntensity} onValueChange={(v) => onChange({ ...value, motionIntensity: v as MotionLevel })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MOTION_LEVELS.map((l) => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={onGenerate} disabled={disabled || busy}>
          {busy ? 'Generating…' : generateLabel}
        </Button>
      </div>

      {value.creationMode === 'CINEMATIC_UNIVERSE' && (
        <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
          <div className="flex items-center gap-2 text-sm font-medium">
            <SlidersHorizontal className="h-4 w-4 text-primary" /> Advanced cinematic options
            <span className="text-xs font-normal text-muted-foreground">— everything is [Auto] unless you override it (§69)</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {ADVANCED_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="text-xs text-muted-foreground">{f.label}</label>
                {f.key === 'motionIntensity' ? (
                  <Select value={value.advanced.motionIntensity} onValueChange={(v) => setAdvanced(f.key, v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      {MOTION_LEVELS.map((l) => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
                      <SelectItem value="EXTREME">Extreme (operator override)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={value.advanced[f.key] as string} onValueChange={(v) => setAdvanced(f.key, v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="on">On</SelectItem>
                      <SelectItem value="off">Off</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
