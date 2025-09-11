
"use client";

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, Camera, MapPin, Loader2, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

type PermissionStatus = 'prompt' | 'granted' | 'denied';

export default function PermissionGate({ children }: { children: ReactNode }) {
  const [micStatus, setMicStatus] = useState<PermissionStatus>('prompt');
  const [cameraStatus, setCameraStatus] = useState<PermissionStatus>('prompt');
  const [locationStatus, setLocationStatus] = useState<PermissionStatus>('prompt');
  const [isLoading, setIsLoading] = useState(true);

  const checkPermissions = useCallback(async () => {
    setIsLoading(true);
    try {
      // Check Camera
      const cameraPerm = await navigator.permissions.query({ name: 'camera' as PermissionName });
      setCameraStatus(cameraPerm.state);
      
      // Check Microphone
      const micPerm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      setMicStatus(micPerm.state);

      // Check Geolocation
      const locationPerm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      setLocationStatus(locationPerm.state);

    } catch (error) {
      console.error("Error checking permissions:", error);
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  const requestPermissions = async () => {
    setIsLoading(true);
    try {
      // Request Camera
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
      } catch (e) {
        console.warn("Camera permission denied by user.");
      }

      // Request Microphone
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        console.warn("Microphone permission denied by user.");
      }
      
      // Request Location
      try {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
             enableHighAccuracy: true,
             timeout: 5000,
             maximumAge: 0
          });
        });
      } catch (e: any) {
         console.warn(`Location permission denied by user: ${e.message}`);
      }

    } catch (error) {
      console.error("Error requesting permissions:", error);
    } finally {
       // Re-check permissions after requesting
      checkPermissions();
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-screen p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Verificando permissões...</p>
      </div>
    );
  }

  const allGranted = micStatus === 'granted' && cameraStatus === 'granted' && locationStatus === 'granted';
  if (allGranted) {
    return <>{children}</>;
  }

  const anyDenied = micStatus === 'denied' || cameraStatus === 'denied' || locationStatus === 'denied';

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <Card className="w-full max-w-md">
            <CardHeader>
                <div className="mx-auto bg-primary text-primary-foreground rounded-full h-16 w-16 flex items-center justify-center mb-4">
                   <ShieldAlert className="h-8 w-8" />
                </div>
                <CardTitle className="text-center">Permissões Necessárias</CardTitle>
                <CardDescription className="text-center">
                    Para usar todas as funcionalidades do aplicativo, precisamos do seu consentimento para acessar sua câmera, microfone e localização.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                        <Camera className="h-5 w-5 text-muted-foreground" />
                        <span>Câmera</span>
                    </div>
                    <span className={`text-sm font-semibold ${cameraStatus === 'granted' ? 'text-green-500' : 'text-amber-500'}`}>
                        {cameraStatus === 'granted' ? 'Permitido' : 'Necessário'}
                    </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                        <Mic className="h-5 w-5 text-muted-foreground" />
                        <span>Microfone</span>
                    </div>
                    <span className={`text-sm font-semibold ${micStatus === 'granted' ? 'text-green-500' : 'text-amber-500'}`}>
                        {micStatus === 'granted' ? 'Permitido' : 'Necessário'}
                    </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                        <MapPin className="h-5 w-5 text-muted-foreground" />
                        <span>Localização</span>
                    </div>
                     <span className={`text-sm font-semibold ${locationStatus === 'granted' ? 'text-green-500' : 'text-amber-500'}`}>
                        {locationStatus === 'granted' ? 'Permitido' : 'Necessário'}
                    </span>
                </div>
                {anyDenied && (
                     <Alert variant="destructive">
                        <AlertTitle>Permissões Bloqueadas</AlertTitle>
                        <AlertDescription>
                            Uma ou mais permissões foram bloqueadas. Você precisa habilitá-las manualmente nas configurações do seu navegador para continuar.
                        </AlertDescription>
                    </Alert>
                )}
            </CardContent>
            <CardFooter>
                <Button className="w-full" onClick={requestPermissions} disabled={anyDenied}>
                    {isLoading ? <Loader2 className="animate-spin" /> : 'Conceder Permissões'}
                </Button>
            </CardFooter>
        </Card>
    </div>
  );
}

