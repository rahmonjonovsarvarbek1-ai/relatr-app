import React, { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useSpecialDayImage } from '../utils/specialDayImages';
import SpecialDayIcon from './SpecialDayIcon';

interface Props {
  id: string;
  name: string;
  icon?: string | null;
  category?: string | null;
  /** Kvadrat tomoni (default 44). */
  size?: number;
  /** Burchak radiusi; berilmasa to'liq doira. */
  borderRadius?: number;
}

/** Rasm topilsa Wikipedia rasmi, aks holda ikonka ko'rsatadi. */
const SpecialDayThumb: React.FC<Props> = ({ id, name, icon, category, size = 44, borderRadius }) => {
  const { colors } = useTheme();
  const url = useSpecialDayImage(id, name);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (url && !failed) {
    return (
      <Image
        source={{ uri: url }}
        style={{
          width: size,
          height: size,
          borderRadius: borderRadius ?? size / 2,
          backgroundColor: colors.cardAlt,
        }}
        resizeMode="cover"
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return <SpecialDayIcon icon={icon} category={category} size={size} />;
};

export default SpecialDayThumb;