import java.nio.file.*;
import java.security.*;
import java.io.*;
/** Signs manifest in place using the existing private keystore. Never exports the key. */
public final class PackSigner {
 public static void main(String[] args)throws Exception {
  if(args.length!=5)throw new IllegalArgumentException("keystore password-file alias manifest signature");
  char[] password=Files.readString(Path.of(args[1])).trim().toCharArray();KeyStore store=KeyStore.getInstance("PKCS12");
  try(InputStream in=Files.newInputStream(Path.of(args[0]))){store.load(in,password);}
  PrivateKey key=(PrivateKey)store.getKey(args[2],password);Signature signer=Signature.getInstance(key.getAlgorithm().equals("RSA")?"SHA256withRSA":"SHA256withECDSA");
  signer.initSign(key);signer.update(Files.readAllBytes(Path.of(args[3])));Files.write(Path.of(args[4]),signer.sign());java.util.Arrays.fill(password,'\0');
 }
}
