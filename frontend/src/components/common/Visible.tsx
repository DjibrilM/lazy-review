import React from 'react';

type Props = {
  visible?: boolean;
  fallback?: React.ReactNode;
  children?: React.ReactNode;
};

const Visibility = ({ visible, fallback, children }: Props) => {
  return !visible && fallback ? fallback : !visible ? null : <>{children}</>;
};

export default Visibility;
