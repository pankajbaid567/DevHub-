import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Zap, Code, Terminal, Cpu, Brain, Shield } from 'lucide-react';

const CyberpunkDemo = () => {
  const { isCyberpunk } = useTheme();

  if (!isCyberpunk) return null;

  return (
    <div className="cyber-container cyber-p-8">
      {/* Hero Section */}
      <div className="text-center cyber-m-8">
        <h1 className="cyber-text-4xl cyber-font-accent cyber-text-neon-pink cyber-glow-anim">
          CYBERPUNK MODE ACTIVATED
        </h1>
        <p className="cyber-text-lg cyber-text-neon-blue cyber-terminal-cursor">
          Welcome to the matrix, developer
        </p>
      </div>

      {/* Feature Cards Grid */}
      <div className="cyber-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {/* Neon Card */}
        <div className="cyber-card-neon cyber-p-6">
          <div className="cyber-flex" style={{ alignItems: 'center', marginBottom: 'var(--cyber-space-4)' }}>
            <Zap className="cyber-text-neon-blue" size={32} />
            <h3 className="cyber-text-xl cyber-font-accent cyber-text-neon-blue">
              NEURAL INTERFACE
            </h3>
          </div>
          <p className="cyber-text-base cyber-text-secondary">
            Direct connection to the digital realm. Experience enhanced coding capabilities 
            with real-time syntax highlighting and AI-powered assistance.
          </p>
          <button className="cyber-btn-neon cyber-p-4" style={{ marginTop: 'var(--cyber-space-4)' }}>
            JACK IN
          </button>
        </div>

        {/* Hack Card */}
        <div className="cyber-card-hack cyber-p-6">
          <div className="cyber-flex" style={{ alignItems: 'center', marginBottom: 'var(--cyber-space-4)' }}>
            <Code className="cyber-text-neon-pink" size={32} />
            <h3 className="cyber-text-xl cyber-font-accent cyber-text-neon-pink">
              CODE MATRIX
            </h3>
          </div>
          <p className="cyber-text-base cyber-text-secondary">
            Manipulate the fabric of reality through code. Access advanced algorithms 
            and cryptographic functions.
          </p>
          <button className="cyber-btn-hack cyber-p-4" style={{ marginTop: 'var(--cyber-space-4)' }}>
            EXECUTE
          </button>
        </div>

        {/* Terminal Card */}
        <div className="cyber-card-neon cyber-p-6 cyber-data-stream">
          <div className="cyber-flex" style={{ alignItems: 'center', marginBottom: 'var(--cyber-space-4)' }}>
            <Terminal className="cyber-text-neon-green" size={32} />
            <h3 className="cyber-text-xl cyber-font-accent cyber-text-neon-green">
              TERMINAL ACCESS
            </h3>
          </div>
          <p className="cyber-text-base cyber-text-secondary">
            Command line interface to the mainframe. Execute system commands 
            and navigate the digital infrastructure.
          </p>
          <div className="cyber-input-neon cyber-p-4 cyber-font-mono" style={{ marginTop: 'var(--cyber-space-4)' }}>
            <span className="cyber-text-neon-green">root@devhub:~$</span>
            <span className="cyber-terminal-cursor">ls -la /cyber/matrix</span>
          </div>
        </div>
      </div>

      {/* Glitch Text Demo */}
      <div className="text-center cyber-m-8">
        <div 
          className="cyber-glitch cyber-text-3xl cyber-font-accent cyber-text-neon-purple"
          data-text="SYSTEM_OVERLOAD"
        >
          SYSTEM_OVERLOAD
        </div>
      </div>

      {/* Stats Grid */}
      <div className="cyber-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: 'var(--cyber-space-8)' }}>
        <div className="cyber-neon-border cyber-p-6 text-center">
          <Cpu className="cyber-text-neon-blue cyber-pulse" size={48} style={{ margin: '0 auto var(--cyber-space-4)' }} />
          <div className="cyber-text-2xl cyber-font-mono cyber-text-neon-blue">98.7%</div>
          <div className="cyber-text-sm cyber-text-muted">CPU EFFICIENCY</div>
        </div>

        <div className="cyber-neon-border cyber-p-6 text-center">
          <Brain className="cyber-text-neon-pink cyber-flicker" size={48} style={{ margin: '0 auto var(--cyber-space-4)' }} />
          <div className="cyber-text-2xl cyber-font-mono cyber-text-neon-pink">127.3</div>
          <div className="cyber-text-sm cyber-text-muted">AI NEURAL NODES</div>
        </div>

        <div className="cyber-neon-border cyber-p-6 text-center">
          <Shield className="cyber-text-neon-green cyber-glitch-anim" size={48} style={{ margin: '0 auto var(--cyber-space-4)' }} />
          <div className="cyber-text-2xl cyber-font-mono cyber-text-neon-green">ACTIVE</div>
          <div className="cyber-text-sm cyber-text-muted">FIREWALL STATUS</div>
        </div>
      </div>

      {/* Holographic Panel */}
      <div className="cyber-hologram cyber-p-8 cyber-m-8 text-center">
        <h2 className="cyber-text-2xl cyber-font-accent cyber-text-neon-blue cyber-glow-anim">
          HOLOGRAPHIC INTERFACE
        </h2>
        <p className="cyber-text-base cyber-text-secondary">
          This panel demonstrates the holographic sweep effect with dynamic background patterns.
        </p>
      </div>

      {/* Circuit Board Footer */}
      <div className="cyber-circuit cyber-p-8 cyber-m-8">
        <div className="text-center">
          <p className="cyber-text-sm cyber-text-muted cyber-font-mono">
            [CYBERPUNK_MODE] :: SYSTEM_INITIALIZED :: NEURAL_LINK_ESTABLISHED
          </p>
        </div>
      </div>
    </div>
  );
};

export default CyberpunkDemo;

