# 🌟 CYBERPUNK THEME 🌟

Welcome to the future of development! The DevHub+ Cyberpunk theme transforms your development platform into a futuristic, neon-lit interface straight out of a sci-fi movie.

## 🎨 Theme Features

### Visual Effects
- **Neon Glows**: Electric blue, hot pink, and neon green accents with dynamic glow effects
- **Scan Lines**: Animated scanning effects across the interface
- **Glitch Text**: Matrix-style text distortion effects
- **Holographic Panels**: Sweeping hologram-like animations
- **Circuit Patterns**: Futuristic circuit board background textures
- **Matrix Rain**: Falling code effect in the background

### Color Palette
- **Primary Colors**:
  - Cyber Pink: `#ff0080`
  - Neon Blue: `#00ffff`
  - Electric Green: `#39ff14`
  - Cyber Purple: `#8a2be2`
  - Neon Orange: `#ff4500`

- **Background Colors**:
  - Deep Black: `#0a0a0a`
  - Dark Navy: `#1a1a2e`
  - Cyber Dark: `#16213e`

### Typography
- **Primary Font**: JetBrains Mono (monospace for that terminal feel)
- **Secondary Font**: Inter (clean sans-serif for readability)
- **Accent Font**: Orbitron/Exo 2 (futuristic headings)

## 🎯 Component Styles

### Buttons
- **Primary**: Neon gradient with glow effects and scan line animations
- **Secondary**: Transparent with neon borders and hover effects
- **Neon Button** (`.cyber-btn-neon`): Classic cyberpunk styling
- **Hack Button** (`.cyber-btn-hack`): Matrix-style with animated effects

### Cards
- **Standard Cards**: Dark backgrounds with neon borders and blur effects
- **Neon Cards** (`.cyber-card-neon`): Electric blue glow styling
- **Hack Cards** (`.cyber-card-hack`): Pink neon with circuit patterns

### Inputs
- **Terminal Style**: Monospace font with neon focus effects
- **Cyberpunk Inputs** (`.cyber-input-neon`): Full futuristic styling

### Navigation
- **Animated Navbar**: Reactive glow effects and scan line overlays
- **Logo Animation**: Pulsing effects and color transitions
- **Active States**: Neon highlighting with shadow effects

## 🚀 Usage

### Theme Activation
The cyberpunk theme is automatically applied when selected via the theme toggle in the navbar. The theme cycles through: Light → Dark → Cyberpunk

### CSS Classes
Use these utility classes to apply cyberpunk effects:

#### Text Effects
```css
.cyber-text-neon-blue    /* Neon blue text with glow */
.cyber-text-neon-pink    /* Neon pink text with glow */
.cyber-text-neon-green   /* Neon green text with glow */
.cyber-text-glow         /* Generic glow effect */
```

#### Animations
```css
.cyber-pulse             /* Pulsing animation */
.cyber-glow-anim         /* Glow pulse effect */
.cyber-flicker           /* Flicker effect */
.cyber-glitch-anim       /* Glitch distortion */
```

#### Layout & Effects
```css
.cyber-scanlines         /* Scan line overlay */
.cyber-grid              /* Cyberpunk grid background */
.cyber-hologram          /* Holographic sweep effect */
.cyber-circuit           /* Circuit board pattern */
.cyber-neon-border       /* Animated neon border */
```

#### Special Components
```css
.cyber-terminal-cursor   /* Blinking terminal cursor */
.cyber-data-stream       /* Flowing data effect */
.cyber-matrix-bg         /* Matrix rain background */
```

## 🎮 Interactive Elements

### Hover Effects
- Buttons lift and glow on hover
- Cards get enhanced neon borders
- Text gains shadow effects
- Icons pulse and scale

### Focus States
- Inputs get electric blue focus rings
- Interactive elements pulse with neon colors
- Keyboard navigation highlighted with cyberpunk styling

### Loading States
- Spinning neon loading indicators
- Progress bars with electric effects
- Animated scan line loading

## 🛠 Development

### Theme Context
The theme is managed through `ThemeContext.jsx` which provides:
- `theme`: Current theme ('light' | 'dark' | 'cyberpunk')
- `isCyberpunk`: Boolean for conditional cyberpunk styling
- `toggleTheme()`: Cycles through theme options

### Design Tokens
All cyberpunk colors, animations, and effects are defined in `design-tokens.css` as CSS custom properties:
- `--cyber-neon-*`: Color variables
- `--cyber-glow-*`: Glow effect definitions
- `--cyber-space-*`: Spacing system
- `--cyber-radius-*`: Border radius values

### Responsive Design
The cyberpunk theme maintains full responsiveness:
- Mobile-optimized neon effects
- Reduced animations on mobile for performance
- Touch-friendly interactive elements

## 🎨 Customization

### Adding New Effects
1. Define new CSS custom properties in `design-tokens.css`
2. Create keyframe animations for dynamic effects
3. Add utility classes in the cyberpunk section
4. Use the `isCyberpunk` context for conditional rendering

### Performance Considerations
- GPU-accelerated animations using `transform` and `opacity`
- Reduced motion support via `prefers-reduced-motion`
- Efficient CSS selector usage
- Optimized background effects

## 🌟 Best Practices

1. **Accessibility**: All neon effects maintain sufficient contrast ratios
2. **Performance**: Effects are GPU-accelerated and optimized
3. **Consistency**: Use the design token system for all styling
4. **Responsive**: Test effects across all device sizes
5. **Fallbacks**: Graceful degradation for older browsers

## 🎪 Demo Components

The `CyberpunkDemo.jsx` component showcases all available effects:
- Animated cards with different styles
- Glitch text demonstrations
- Terminal interfaces
- Holographic panels
- Circuit board patterns

---

**Welcome to the future of development. Happy coding, cyber warrior! 🤖⚡**

