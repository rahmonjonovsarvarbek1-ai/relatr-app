import React, { memo, useEffect, useMemo, useState } from 'react';
import { Image } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useSpecialDayImage } from '../utils/specialDayImages';
import SpecialDayIcon from './SpecialDayIcon';

interface Props {
  id: string;
  name: string;
  icon?: string | null;
  category?: string | null;
  /** Square side (default 44). */
  size?: number;
  /** Corner radius; a full circle when omitted. */
  borderRadius?: number;
}

/** Shows the Wikipedia image when one exists, otherwise the category icon. */
const SpecialDayThumb: React.FC<Props> = ({ id, name, icon, category, size = 44, borderRadius }) => {
  const { colors } = useTheme();
  const url = useSpecialDayImage(id, name);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  const style = useMemo(
    () => ({
      width: size,
      height: size,
      borderRadius: borderRadius ?? size / 2,
      backgroundColor: colors.cardAlt,
    }),
    [size, borderRadius, colors.cardAlt],
  );

  if (url && !failed) {
    return (
      <Image
        source={{ uri: url }}
        style={style}
        resizeMode="cover"
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return <SpecialDayIcon icon={icon} category={category} size={size} />;
};

export default memo(SpecialDayThumb);