// src/theme/designSystem.js - Centralized design tokens

export const designTokens = {
  colors: {
    // Background
    bgPrimary: '#F5F3FF',        // Light lavender background
    bgSecondary: '#FFFFFF',      // White
    bgGray: '#F5F6FA',           // Light gray for alt backgrounds
    
    // Primary brand colors
    primaryBlue: '#2563EB',      // Main blue for buttons/actions
    primaryBlueDark: '#1E40AF',  // Hover state
    primaryBlueLight: '#DBEAFE', // Background hover
    
    // Text colors
    textPrimary: '#1F293C',      // Dark text
    textSecondary: '#757575',    // Muted text
    textTertiary: '#999999',     // Lighter text
    textPlaceholder: '#BDBDBD',  // Placeholder text
    
    // Status colors
    statusActive: '#10B981',     // Green - Active/Success
    statusInactive: '#EF4444',   // Red - Inactive/Error  
    statusWarning: '#F59E0B',    // Orange - Warning
    statusPending: '#6B7280',    // Gray - Pending
    
    // Border/Dividers
    borderLight: '#E5E7EB',      // Light border
    borderGray: '#D1D5DB',       // Medium border
    borderDark: '#9CA3AF',       // Dark border
    
    // Special
    linkBlue: '#0066FF',
    errorRed: '#DC2626',
    successGreen: '#16A34A',
    warningOrange: '#EA580C'
  },
  
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    xxl: '32px',
    xxxl: '40px'
  },
  
  sizing: {
    sidebarWidth: '240px',
    topbarHeight: '64px',
    maxCardWidth: '600px',
    maxPageWidth: '1400px'
  },
  
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
  },
  
  borderRadius: {
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
    full: '9999px'
  },
  
  typography: {
    // Font families
    fontFamily: "sans-serif",
    
    // Font sizes
    xs: '12px',
    sm: '13px',
    base: '14px',
    lg: '16px',
    xl: '18px',
    '2xl': '20px',
    '3xl': '24px',
    '4xl': '28px',
    '5xl': '32px'
  }
}

export default designTokens
